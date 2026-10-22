import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "../db/pool";
import { coreConfig } from "../config";
import { messageSchema, type NotificationAdapter } from "./adapters";
import { providerResponseCategory } from "./notification-diagnostics";

const settings = z
  .object({
    apiKey: z
      .string()
      .min(20)
      .max(1024)
      .regex(/^[^\s]+$/),
    senderEmail: z.email().max(254),
    senderName: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[^\r\n]+$/),
    baseURL: z.url(),
  })
  .strict();
export type BrevoSettings = z.infer<typeof settings>;
export function brevoSettings(baseURL = coreConfig().baseURL): BrevoSettings {
  if (process.env.LONDOS_EMAIL_PROVIDER !== "brevo") throw new Error("email_provider_unavailable");
  const value = settings.safeParse({
    apiKey: process.env.LONDOS_BREVO_API_KEY,
    senderEmail: process.env.LONDOS_EMAIL_FROM,
    senderName: process.env.LONDOS_EMAIL_FROM_NAME,
    baseURL,
  });
  if (!value.success) throw new Error("email_configuration_invalid");
  return value.data;
}
export function notificationsConfigured(config = coreConfig()) {
  try {
    if (config.localAdapters) return true;
    brevoSettings(config.baseURL);
    return true;
  } catch {
    return false;
  }
}

function escapeHTML(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function paragraphs(value: string) {
  return value
    .split(/\n{2,}/)
    .map((part) => `<p style="margin:0 0 16px">${escapeHTML(part).replaceAll("\n", "<br>")}</p>`)
    .join("");
}
function brandedHTML(input: {
  origin: string;
  preview: string;
  heading: string;
  body: string;
  action?: { label: string; url: string };
}) {
  const home = escapeHTML(new URL("/", input.origin).href);
  const logo = escapeHTML(new URL("/brand/londos-logo.png", input.origin).href);
  const privacy = escapeHTML(new URL("/privacy", input.origin).href);
  const terms = escapeHTML(new URL("/terms", input.origin).href);
  const button = input.action
    ? `<p style="margin:24px 0"><a href="${escapeHTML(input.action.url)}" style="background:#4338ca;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;font-weight:700">${escapeHTML(input.action.label)}</a></p>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHTML(input.heading)}</title></head><body style="margin:0;background:#f5f3ff;color:#172033;font-family:Arial,sans-serif"><span style="display:none;max-height:0;overflow:hidden">${escapeHTML(input.preview)}</span><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ff;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #ddd6fe;border-radius:14px;overflow:hidden"><tr><td style="background:#17152c;color:#fff;padding:22px 28px"><strong style="font-size:24px">Londos</strong><div style="color:#c4b5fd;margin-top:4px">Your shop in a shared digital mall</div></td></tr><tr><td style="padding:30px 28px"><h1 style="font-size:26px;line-height:1.2;margin:0 0 18px;color:#17152c">${escapeHTML(input.heading)}</h1>${input.body}${button}<p style="margin:28px 0 0;color:#667085;font-size:13px;line-height:1.5">For your security, never share a verification, recovery or payment reference. Londos staff will not ask for your password.</p></td></tr><tr><td style="padding:18px 28px;background:#fafafa;color:#667085;font-size:12px">This operational email was sent by Londos. Reply only through the support details shown inside your authenticated Londos workspace.</td></tr></table></td></tr></table></body></html>`;
}

export function brevoMessage(message: Record<string, unknown>, origin: string) {
  const value = messageSchema.parse(message);
  let subject: string,
    text: string,
    body: string,
    action: { label: string; url: string } | undefined;
  const link = new URL(origin);
  if (
    !/^https?:$/.test(link.protocol) ||
    link.username ||
    link.password ||
    link.search ||
    link.hash ||
    link.pathname !== "/"
  )
    throw new Error("email_origin_invalid");
  if (value.template === "password-reset" || value.template === "email-verification") {
    const actionURL = new URL(value.url);
    const expectedPath =
      value.template === "password-reset"
        ? /^\/api\/auth\/reset-password\/[^/]+$/
        : /^\/api\/auth\/verify-email$/;
    if (
      actionURL.origin !== link.origin ||
      actionURL.username ||
      actionURL.password ||
      actionURL.hash ||
      !expectedPath.test(actionURL.pathname)
    )
      throw new Error("email_link_denied");
    subject =
      value.template === "password-reset"
        ? "Reset your Londos password"
        : "Verify your Londos email";
    text = `${subject}:\n${actionURL.href}\n\nIf you did not request this, ignore this email. Never share this link.`;
    body = paragraphs(
      value.template === "password-reset"
        ? "Use the secure link below to choose a new password. The link expires and can be used only once.\n\nIf you did not request a reset, you can ignore this message."
        : "Confirm this email address before signing in to the private shopkeeper workspace. The verification link expires and can be used only once.",
    );
    action = {
      label: value.template === "password-reset" ? "Reset password" : "Verify email",
      url: actionURL.href,
    };
  } else if (value.template === "invitation") {
    link.pathname = "/shopkeeper/invitations";
    link.searchParams.set("token", value.token);
    subject = "Londos team invitation";
    text = `A merchant invited you to their Londos team. Review the invitation after signing in:\n${link.href}`;
    body = paragraphs(
      "A merchant invited you to help manage their Londos shop. Sign in with this email address, then review the role and permissions before accepting.",
    );
    action = { label: "Review invitation", url: link.href };
  } else if (value.template === "shop-welcome") {
    link.pathname = `/shopkeeper/shops/${value.shopId}`;
    subject = `Your Londos shop is ready: ${value.shopName}`;
    text = `${value.shopName} is ready. Open the secure shopkeeper workspace to add your catalogue, contact details and design:\n${link.href}`;
    body = paragraphs(
      `${value.shopName} now has a private Londos workspace. Add products and departments, confirm your contact details, customise the design, then publish when you are ready.`,
    );
    action = { label: "Open shop workspace", url: link.href };
  } else if (value.template === "monthly-report") {
    link.pathname = `/shopkeeper/shops/${value.shopId}/analytics`;
    subject = `${value.shopName} · Londos report for ${value.month}`;
    text = `${subject}\nShop views: ${value.shopViews}\nProduct views: ${value.productViews}\nDiscovery clicks: ${value.discoveryClicks}\nContact actions: ${value.contactActions}\n${link.href}\n\nCounts are privacy-preserving recorded actions, not unique people.`;
    body = `${paragraphs(`Here is the privacy-preserving activity summary for ${value.shopName} during ${value.month}.`)}<table role="presentation" width="100%" cellspacing="0" cellpadding="8" style="border-collapse:collapse;margin:12px 0 20px"><tr><td style="border-bottom:1px solid #e5e7eb">Shop views</td><td align="right" style="border-bottom:1px solid #e5e7eb"><strong>${escapeHTML(value.shopViews)}</strong></td></tr><tr><td style="border-bottom:1px solid #e5e7eb">Product views</td><td align="right" style="border-bottom:1px solid #e5e7eb"><strong>${escapeHTML(value.productViews)}</strong></td></tr><tr><td style="border-bottom:1px solid #e5e7eb">Discovery clicks</td><td align="right" style="border-bottom:1px solid #e5e7eb"><strong>${escapeHTML(value.discoveryClicks)}</strong></td></tr><tr><td>Contact actions</td><td align="right"><strong>${escapeHTML(value.contactActions)}</strong></td></tr></table>${paragraphs("These are aggregate recorded actions, not unique visitors. Open analytics for context and keep your catalogue current so customers see accurate information.")}`;
    action = { label: "Review shop analytics", url: link.href };
  } else if (value.template === "campaign") {
    subject = value.subject;
    text = `${value.subject}\n\n${value.body}`;
    body = paragraphs(value.body);
    if (value.ctaLabel && value.ctaPath) {
      const target = new URL(value.ctaPath, link);
      if (target.origin !== link.origin) throw new Error("email_link_denied");
      text += `\n\n${value.ctaLabel}: ${target.href}`;
      action = { label: value.ctaLabel, url: target.href };
    }
  } else if (value.template === "tenancy-status") {
    link.pathname = value.invoice
      ? `/shopkeeper/invoices/${value.invoice.id}`
      : `/shopkeeper/shops/${value.shopId}/rent`;
    subject = `Londos rent status: ${value.state.replaceAll("_", " ")}`;
    const paymentLines = value.payment
      ? [
          `Support: ${value.payment.supportEmail}${value.payment.supportPhone ? ` / ${value.payment.supportPhone}` : ""}`,
          value.payment.mobileMoneyPhone
            ? `Mobile money: ${value.payment.mobileMoneyPhone} (${value.payment.mobileMoneyName})`
            : null,
          value.payment.bankName
            ? `Bank: ${value.payment.bankName}; ${value.payment.bankAccountName}; ${value.payment.bankAccountNumber}`
            : null,
        ].filter(Boolean)
      : [];
    text = `${subject}\nCoverage end: ${value.periodEnd}${value.invoice ? `\nInvoice: ${value.invoice.reference}\nRemaining: ${value.invoice.remaining_minor} ${value.invoice.currency}` : ""}${paymentLines.length ? `\n${paymentLines.join("\n")}` : ""}\n\nReview the current authenticated invoice before paying:\n${link.href}`;
    body = paragraphs(
      `Your shop tenancy is ${value.state.replaceAll("_", " ")}. Coverage currently ends ${value.periodEnd}.${value.invoice ? `\n\nInvoice ${value.invoice.reference} has ${value.invoice.remaining_minor} ${value.invoice.currency} remaining.` : ""}${paymentLines.length ? `\n\n${paymentLines.join("\n")}` : "\n\nPayment instructions are not configured; contact Londos support in the authenticated workspace."}\n\nAfter paying externally, submit the transaction reference in Londos. A finance operator must verify it before coverage changes.`,
    );
    action = { label: "Review invoice", url: link.href };
  } else {
    subject = "Your Londos account has an update";
    link.pathname =
      value.template === "rent-credit" ? `/shopkeeper/invoices/${value.invoiceId}` : "/shopkeeper";
    text = `There is an update to your ${value.template.replaceAll("-", " ")} record. Sign in to Londos to review its current details:\n${link.href}\n\nLondos does not collect customer checkout payments.`;
    body = paragraphs(
      `There is an update to your ${value.template.replaceAll("-", " ")} record. Sign in to view the current status and full history.`,
    );
    action = { label: "Open Londos", url: link.href };
  }
  return {
    to: value.to,
    subject,
    text,
    html: brandedHTML({ preview: subject, heading: subject, body, ...(action ? { action } : {}) }),
  };
}

function positiveLimit(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 1_000_000)
    throw new Error(`${name.toLowerCase()}_invalid`);
  return value;
}
export function emailLimits() {
  return {
    hourly: positiveLimit("LONDOS_EMAIL_MAX_PER_HOUR", 250),
    daily: positiveLimit("LONDOS_EMAIL_MAX_PER_DAY", 250),
  };
}
export class EmailQuotaDeferred extends Error {
  constructor(readonly availableAt: Date) {
    super("email_quota_deferred");
  }
}
async function reserveQuota(db: import("pg").PoolClient) {
  const limits = emailLimits();
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('londos:email-quota',0))");
  for (const [kind, limit] of [
    ["hour", limits.hourly],
    ["day", limits.daily],
  ] as const) {
    const bucket = (await db.query(`SELECT date_trunc($1,clock_timestamp()) AS start`, [kind]))
      .rows[0].start as Date;
    const reserved = await db.query(
      `INSERT INTO email_quota_windows(kind,bucket_start,attempts) VALUES($1,$2,1)
       ON CONFLICT(kind,bucket_start) DO UPDATE SET attempts=email_quota_windows.attempts+1
       WHERE email_quota_windows.attempts<$3 RETURNING attempts`,
      [kind, bucket, limit],
    );
    if (!reserved.rowCount) {
      const next = new Date(bucket);
      if (kind === "hour") next.setUTCHours(next.getUTCHours() + 1);
      else next.setUTCDate(next.getUTCDate() + 1);
      next.setUTCSeconds(next.getUTCSeconds() + 2);
      throw new EmailQuotaDeferred(next);
    }
  }
}

export class BrevoNotifications implements NotificationAdapter {
  constructor(
    private readonly pool: Pool,
    private readonly config: BrevoSettings = brevoSettings(),
    private readonly transport: typeof fetch = fetch,
  ) {
    settings.parse(config);
  }
  async deliver(
    key: string,
    message: Record<string, unknown>,
    signal: AbortSignal,
    authority?: { leaseToken: string },
  ) {
    z.uuid().parse(key);
    const leaseToken = z.uuid().parse(authority?.leaseToken);
    const rendered = brevoMessage(message, this.config.baseURL);
    // Reserved fictional addresses never reach the live provider.
    if (
      /\.(?:invalid|example|test|localhost)$|(?:^|\.)example\.(?:com|net|org)$/i.test(
        rendered.to.split("@")[1] ?? "",
      )
    )
      throw new Error("fictional_email_denied");
    const payload = {
      sender: { email: this.config.senderEmail, name: this.config.senderName },
      to: [{ email: rendered.to }],
      subject: rendered.subject,
      textContent: rendered.text,
      htmlContent: rendered.html,
      // Brevo requires a UUID; a namespace prefix invalidates the provider key.
      headers: { idempotencyKey: key },
    };
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([messageSchema.parse(message), payload]))
      .digest("hex");
    signal.throwIfAborted();
    const start = await transaction(this.pool, async (db) => {
      const previous = (
        await db.query("SELECT fingerprint,state FROM notification_deliveries WHERE job_id=$1", [
          key,
        ])
      ).rows[0];
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new Error("delivery_payload_changed");
        if (previous.state === "accepted") return false;
        throw new Error("delivery_requires_reconciliation");
      }
      await reserveQuota(db);
      const inserted = await db.query(
        "INSERT INTO notification_deliveries(job_id,fingerprint,provider,state) SELECT id,$2,'brevo','attempting' FROM jobs WHERE id=$1 AND kind='notification.local' AND state='running' AND lease_token=$3 AND payload=$4::jsonb AND lease_until>clock_timestamp() ON CONFLICT DO NOTHING RETURNING job_id",
        [key, fingerprint, leaseToken, JSON.stringify(message)],
      );
      if (!inserted.rowCount) throw new Error("delivery_not_owned");
      return true;
    });
    if (!start) return;
    let outcome: "accepted" | "uncertain" | "rejected" = "uncertain",
      reference: string | null = null;
    let httpStatus: number | null = null;
    try {
      signal.throwIfAborted();
      const response = await this.transport("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        headers: {
          "api-key": this.config.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      httpStatus = response.status;
      if (response.status >= 400 && response.status < 500) {
        outcome = "rejected";
        await response.body?.cancel().catch(() => {});
      } else if (response.status === 201) {
        // Do not retain or log error bodies, recipient identities or action tokens.
        const reader = response.body?.getReader();
        if (!reader) throw new Error("provider_response_missing");
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 8192) throw new Error("provider_response_oversized");
            chunks.push(value);
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        const result = z
          .object({
            messageId: z
              .string()
              .min(1)
              .max(256)
              .regex(/^[^\r\n]+$/),
          })
          .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        outcome = "accepted";
        reference = result.messageId;
      } else {
        await response.body?.cancel().catch(() => {});
      }
    } catch {
      /* Ambiguous network/timeout outcomes never resend automatically. */
    }
    await this.pool.query(
      "UPDATE notification_deliveries SET state=$2,provider_reference=$3,updated_at=clock_timestamp() WHERE job_id=$1 AND state='attempting'",
      [key, outcome, reference],
    );
    // Accepted means Brevo accepted the API request, not inbox delivery. Retain no
    // response body, recipient, sender, message ID, API key or action URL in logs.
    console.log(
      JSON.stringify({
        time: new Date().toISOString(),
        event: "notification.delivery",
        provider: "brevo",
        jobId: key,
        outcome,
        httpStatus,
        category:
          outcome === "accepted"
            ? "provider_accepted_not_delivery_confirmed"
            : providerResponseCategory(httpStatus),
      }),
    );
    if (outcome !== "accepted") throw new Error("delivery_requires_reconciliation");
  }
}
