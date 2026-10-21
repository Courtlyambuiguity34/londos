import { randomUUID } from "node:crypto";
import { validCampaignPath } from "../modules/communications/cta";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "./db/pool";
import { enqueue } from "./jobs/enqueue";
import { audit } from "./security/audit";
import { requireOperator, type Actor } from "./security/authorization";
import { AccessError } from "./security/errors";

const phone = z.string().regex(/^\+[1-9][0-9]{7,14}$/);
const optionalText = (maximum: number) =>
  z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().trim().min(2).max(maximum).nullable(),
  );

export const paymentSettingsInput = z
  .object({
    version: z.number().int().nonnegative(),
    supportEmail: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    supportPhone: z.preprocess((value) => (value === "" ? null : value), phone.nullable()),
    mobileMoneyPhone: z.preprocess((value) => (value === "" ? null : value), phone.nullable()),
    mobileMoneyName: optionalText(120),
    bankName: optionalText(120),
    bankAccountName: optionalText(120),
    bankAccountNumber: optionalText(80),
    notifyShops: z.boolean(),
    confirm: z.literal(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.mobileMoneyPhone) !== Boolean(value.mobileMoneyName))
      context.addIssue({ code: "custom", message: "mobile_money_pair_required" });
    const bank = [value.bankName, value.bankAccountName, value.bankAccountNumber];
    if (bank.some(Boolean) && !bank.every(Boolean))
      context.addIssue({ code: "custom", message: "bank_details_complete_required" });
    if (!value.mobileMoneyPhone && !value.bankName)
      context.addIssue({ code: "custom", message: "payment_method_required" });
  });

export type PaymentSettings = {
  version: number;
  support_email: string;
  support_phone: string | null;
  mobile_money_phone: string | null;
  mobile_money_name: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  updated_at: Date;
};

export async function currentPaymentSettings(db: Pool | PoolClient) {
  return (await db.query("SELECT * FROM payment_settings WHERE singleton=true")).rows[0] as
    PaymentSettings | undefined;
}

export const campaignInput = z
  .object({
    subject: z
      .string()
      .trim()
      .min(3)
      .max(140)
      .regex(/^[^\r\n]+$/),
    body: z.string().trim().min(10).max(5000),
    ctaLabel: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(/^[^\r\n]+$/)
      .optional(),
    ctaPath: z.string().refine(validCampaignPath, "invalid_londos_path").optional(),
    audience: z.enum(["all_shops", "new_shops", "specific_shops"]),
    newShopDays: z.number().int().min(1).max(365).optional(),
    shopIds: z.array(z.uuid()).max(500).optional(),
    confirm: z.literal(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.ctaLabel) !== Boolean(value.ctaPath))
      context.addIssue({ code: "custom", message: "cta_pair_required" });
    if ((value.audience === "new_shops") !== Boolean(value.newShopDays))
      context.addIssue({ code: "custom", message: "new_shop_window_required" });
    if ((value.audience === "specific_shops") !== Boolean(value.shopIds?.length))
      context.addIssue({ code: "custom", message: "specific_shops_required" });
  });

type CampaignInput = z.infer<typeof campaignInput>;

async function insertCampaign(db: PoolClient, actor: Actor, value: CampaignInput) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO email_campaigns(id,subject,body,cta_label,cta_path,audience,new_shop_days,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      id,
      value.subject,
      value.body,
      value.ctaLabel ?? null,
      value.ctaPath ?? null,
      value.audience,
      value.newShopDays ?? null,
      actor.userId,
    ],
  );
  if (value.audience === "specific_shops") {
    const targets = await db.query(
      "INSERT INTO email_campaign_targets(campaign_id,shop_id,merchant_id) SELECT $1,s.id,s.merchant_id FROM shops s WHERE s.id=ANY($2::uuid[]) ON CONFLICT DO NOTHING RETURNING shop_id",
      [id, value.shopIds],
    );
    if (targets.rowCount !== new Set(value.shopIds).size)
      throw new AccessError(422, "campaign_target_unavailable");
  }
  const recipients = await db.query(
    `INSERT INTO email_campaign_recipients(id,campaign_id,user_id,merchant_id,email)
     SELECT gen_random_uuid(),$1,m.user_id,m.merchant_id,u.email
     FROM memberships m JOIN "user" u ON u.id=m.user_id AND u."emailVerified"=true
     WHERE m.role='owner' AND m.status='active' AND EXISTS(
       SELECT 1 FROM shops s WHERE s.merchant_id=m.merchant_id
       AND ($2='all_shops'
         OR ($2='new_shops' AND s.created_at>=clock_timestamp()-($3::integer*interval '1 day'))
         OR ($2='specific_shops' AND EXISTS(SELECT 1 FROM email_campaign_targets t WHERE t.campaign_id=$1 AND t.shop_id=s.id)))
     )
     ON CONFLICT DO NOTHING RETURNING id`,
    [id, value.audience, value.newShopDays ?? 0],
  );
  const recipientCount = recipients.rowCount ?? 0;
  await db.query("UPDATE email_campaigns SET recipient_count=$2 WHERE id=$1", [id, recipientCount]);
  await audit(db, actor, "communications.campaign.queued", id, undefined, {
    audience: value.audience,
    recipients: recipientCount,
  });
  return { id, recipients: recipientCount };
}

export async function createCampaign(pool: Pool, actor: Actor, input: CampaignInput) {
  const value = campaignInput.parse(input);
  return transaction(pool, async (db) => {
    await requireOperator(db, actor, "operations", true);
    return insertCampaign(db, actor, value);
  });
}

export async function listCommunications(pool: Pool, actor: Actor) {
  await requireOperator(pool, actor, "operations");
  return {
    paymentSettings: (await currentPaymentSettings(pool)) ?? null,
    campaigns: (
      await pool.query(
        "SELECT id,subject,audience,state,recipient_count,created_at,completed_at FROM email_campaigns ORDER BY created_at DESC,id DESC LIMIT 50",
      )
    ).rows,
    promotions: (
      await pool.query(
        "SELECT id,code,title,benefit,audience,starts_at,ends_at,max_redemptions,active,(SELECT count(*)::int FROM promotion_redemptions r WHERE r.promotion_id=p.id) AS redemptions FROM promotions p ORDER BY created_at DESC,id DESC LIMIT 50",
      )
    ).rows,
    shops: (
      await pool.query(
        "SELECT id,merchant_id,name FROM shops ORDER BY created_at DESC,id DESC LIMIT 500",
      )
    ).rows as { id: string; merchant_id: string; name: string }[],
  };
}

export async function updatePaymentSettings(
  pool: Pool,
  actor: Actor,
  input: z.infer<typeof paymentSettingsInput>,
) {
  const value = paymentSettingsInput.parse(input);
  return transaction(pool, async (db) => {
    await requireOperator(db, actor, "finance", true);
    const previous = await currentPaymentSettings(db);
    if ((previous?.version ?? 0) !== value.version) throw new AccessError(409, "stale_version");
    const next = value.version + 1;
    await db.query(
      `INSERT INTO payment_settings(singleton,version,support_email,support_phone,mobile_money_phone,mobile_money_name,bank_name,bank_account_name,bank_account_number,updated_by)
       VALUES(true,$1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(singleton) DO UPDATE SET version=excluded.version,support_email=excluded.support_email,support_phone=excluded.support_phone,mobile_money_phone=excluded.mobile_money_phone,mobile_money_name=excluded.mobile_money_name,bank_name=excluded.bank_name,bank_account_name=excluded.bank_account_name,bank_account_number=excluded.bank_account_number,updated_by=excluded.updated_by,updated_at=clock_timestamp()`,
      [
        next,
        value.supportEmail,
        value.supportPhone,
        value.mobileMoneyPhone,
        value.mobileMoneyName,
        value.bankName,
        value.bankAccountName,
        value.bankAccountNumber,
        actor.userId,
      ],
    );
    await audit(db, actor, "billing.payment-settings.changed", "payment-settings", undefined, {
      version: next,
      notified: value.notifyShops,
    });
    let campaign: { id: string; recipients: number } | null = null;
    if (value.notifyShops)
      campaign = await insertCampaign(db, actor, {
        subject: "Londos payment instructions changed",
        body: "The payment instructions for Londos rent have changed. Sign in and open your invoice before making a payment. Always use the invoice reference shown in Londos.",
        ctaLabel: "Review payment instructions",
        ctaPath: "/shopkeeper",
        audience: "all_shops",
        confirm: true,
      });
    return { version: next, campaign };
  });
}

export const promotionInput = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{3,31}$/),
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().min(10).max(500),
    benefit: z.enum(["free_period", "percentage", "fixed"]),
    percentOff: z.number().int().min(1).max(100).optional(),
    fixedMinor: z
      .string()
      .regex(/^[1-9][0-9]{0,19}$/)
      .optional(),
    currency: z.enum(["UGX", "USD", "KES", "EUR", "GBP"]).optional(),
    audience: z.enum(["all_shops", "new_shops", "specific_merchants"]),
    merchantIds: z.array(z.uuid()).max(500).optional(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    maxRedemptions: z.number().int().min(1).max(1_000_000).optional(),
    announce: z.boolean(),
    confirm: z.literal(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Date(value.endsAt) <= new Date(value.startsAt))
      context.addIssue({ code: "custom", message: "promotion_window_invalid" });
    if ((value.benefit === "percentage") !== Boolean(value.percentOff))
      context.addIssue({ code: "custom", message: "percentage_required" });
    if ((value.benefit === "fixed") !== Boolean(value.fixedMinor && value.currency))
      context.addIssue({ code: "custom", message: "fixed_amount_required" });
    if ((value.audience === "specific_merchants") !== Boolean(value.merchantIds?.length))
      context.addIssue({ code: "custom", message: "specific_merchants_required" });
  });

export async function createPromotion(
  pool: Pool,
  actor: Actor,
  input: z.infer<typeof promotionInput>,
) {
  const value = promotionInput.parse(input);
  return transaction(pool, async (db) => {
    await requireOperator(db, actor, "finance", true);
    const id = randomUUID();
    await db.query(
      `INSERT INTO promotions(id,code,title,description,benefit,percent_off,fixed_minor,currency,audience,starts_at,ends_at,max_redemptions,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id,
        value.code,
        value.title,
        value.description,
        value.benefit,
        value.percentOff ?? null,
        value.fixedMinor ?? null,
        value.currency ?? null,
        value.audience,
        value.startsAt,
        value.endsAt,
        value.maxRedemptions ?? null,
        actor.userId,
      ],
    );
    if (value.audience === "specific_merchants") {
      const targets = await db.query(
        "INSERT INTO promotion_targets(promotion_id,merchant_id) SELECT $1,id FROM merchants WHERE id=ANY($2::uuid[]) RETURNING merchant_id",
        [id, value.merchantIds],
      );
      if (targets.rowCount !== new Set(value.merchantIds).size)
        throw new AccessError(422, "promotion_target_unavailable");
    }
    await audit(db, actor, "billing.promotion.created", id, undefined, {
      code: value.code,
      audience: value.audience,
      benefit: value.benefit,
    });
    let campaign: { id: string; recipients: number } | null = null;
    if (value.announce) {
      const targetedShops =
        value.audience === "specific_merchants"
          ? (
              await db.query<{ id: string }>(
                "SELECT id FROM shops WHERE merchant_id=ANY($1::uuid[]) ORDER BY id",
                [value.merchantIds],
              )
            ).rows.map((row) => row.id)
          : undefined;
      if (value.audience === "specific_merchants" && !targetedShops?.length)
        throw new AccessError(422, "promotion_target_unavailable");
      campaign = await insertCampaign(db, actor, {
        subject: value.title,
        body: `${value.description}\n\nPromo code: ${value.code}\nAvailable until ${new Date(value.endsAt).toISOString()}.`,
        ctaLabel: "Use your promo code",
        ctaPath: "/shopkeeper/applications",
        audience:
          value.audience === "new_shops"
            ? "new_shops"
            : value.audience === "specific_merchants"
              ? "specific_shops"
              : "all_shops",
        ...(value.audience === "new_shops" ? { newShopDays: 30 } : {}),
        ...(targetedShops ? { shopIds: targetedShops } : {}),
        confirm: true,
      });
    }
    return { id, campaign };
  });
}

async function scheduleCampaigns(db: PoolClient) {
  const rows = (
    await db.query(
      `SELECT r.id,r.campaign_id,r.user_id,r.merchant_id,r.email,c.subject,c.body,c.cta_label,c.cta_path
       FROM email_campaign_recipients r JOIN email_campaigns c ON c.id=r.campaign_id AND c.state='queued'
       WHERE r.job_id IS NULL ORDER BY c.created_at,r.created_at,r.id FOR UPDATE OF r SKIP LOCKED LIMIT 100`,
    )
  ).rows;
  for (const row of rows) {
    const jobId = await enqueue(db, {
      kind: "notification.local",
      key: `campaign:${row.campaign_id}:${row.id}`,
      merchantId: row.merchant_id,
      payload: {
        template: "campaign",
        to: row.email,
        campaignId: row.campaign_id,
        subject: row.subject,
        body: row.body,
        ...(row.cta_label ? { ctaLabel: row.cta_label, ctaPath: row.cta_path } : {}),
      },
    });
    if (jobId)
      await db.query(
        "UPDATE email_campaign_recipients SET job_id=$2 WHERE id=$1 AND job_id IS NULL",
        [row.id, jobId],
      );
  }
  await db.query(
    `UPDATE email_campaigns c SET state=CASE WHEN EXISTS(
       SELECT 1 FROM email_campaign_recipients r JOIN jobs j ON j.id=r.job_id WHERE r.campaign_id=c.id AND j.state='dead'
     ) THEN 'attention' ELSE 'completed' END,completed_at=clock_timestamp()
     WHERE c.state='queued' AND NOT EXISTS(
       SELECT 1 FROM email_campaign_recipients r LEFT JOIN jobs j ON j.id=r.job_id
       WHERE r.campaign_id=c.id AND (r.job_id IS NULL OR j.state NOT IN ('done','dead'))
     )`,
  );
  return rows.length;
}

async function scheduleMonthlyReports(db: PoolClient, now: Date) {
  if (process.env.LONDOS_MONTHLY_REPORTS_ENABLED !== "true") return 0;
  const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const rows = (
    await db.query(
      `SELECT s.id AS shop_id,s.merchant_id,s.name,m.user_id,u.email
       FROM shops s JOIN memberships m ON m.merchant_id=s.merchant_id AND m.role='owner' AND m.status='active'
       JOIN "user" u ON u.id=m.user_id AND u."emailVerified"=true
       WHERE NOT EXISTS(SELECT 1 FROM monthly_report_receipts r WHERE r.report_month=$1 AND r.shop_id=s.id AND r.user_id=m.user_id)
       ORDER BY s.created_at,s.id,m.user_id LIMIT 100 FOR UPDATE OF s SKIP LOCKED`,
      [month],
    )
  ).rows;
  for (const row of rows) {
    const counts = (
      await db.query(
        `SELECT coalesce(sum(count) FILTER(WHERE event='shop_viewed'),0)::text AS shop_views,
          coalesce(sum(count) FILTER(WHERE event='product_viewed'),0)::text AS product_views,
          coalesce(sum(count) FILTER(WHERE event='contact_action_clicked'),0)::text AS contact_actions,
          coalesce(sum(count) FILTER(WHERE event='shop_result_clicked'),0)::text AS discovery_clicks
         FROM pilot_metrics WHERE shop_id=$1 AND day>=$2 AND day<$3`,
        [row.shop_id, month, current],
      )
    ).rows[0];
    const jobId = await enqueue(db, {
      kind: "notification.local",
      key: `monthly-report:${month.toISOString().slice(0, 7)}:${row.shop_id}:${row.user_id}`,
      merchantId: row.merchant_id,
      shopId: row.shop_id,
      payload: {
        template: "monthly-report",
        to: row.email,
        shopId: row.shop_id,
        shopName: row.name,
        month: month.toISOString().slice(0, 7),
        shopViews: counts.shop_views,
        productViews: counts.product_views,
        contactActions: counts.contact_actions,
        discoveryClicks: counts.discovery_clicks,
      },
    });
    if (jobId)
      await db.query(
        "INSERT INTO monthly_report_receipts(report_month,shop_id,merchant_id,user_id,job_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [month, row.shop_id, row.merchant_id, row.user_id, jobId],
      );
  }
  return rows.length;
}

export async function scheduleCommunications(db: PoolClient, now: Date) {
  const campaigns = await scheduleCampaigns(db);
  const reports = await scheduleMonthlyReports(db, now);
  await db.query(
    "DELETE FROM email_quota_windows WHERE bucket_start<clock_timestamp()-interval '8 days'",
  );
  return { campaigns, reports };
}
