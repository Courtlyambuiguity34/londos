import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { createEmailVerificationToken } from "better-auth/api";
import type { Pool } from "pg";
import { z } from "zod";
import { coreConfig } from "./config";
import { transaction } from "./db/pool";
import { enqueue } from "./jobs/enqueue";
import { notificationsConfigured } from "./jobs/brevo";

const credentials = z.object({
  email: z
    .string()
    .trim()
    .pipe(z.email())
    .transform((v) => v.toLowerCase()),
  password: z.string().min(20).max(128),
  name: z.string().trim().min(2).max(100),
});

// Only server-owned environment configuration can invoke this path. No HTTP endpoint exists.
export async function bootstrapAccounts(
  pool: Pool,
  env: Record<string, string | undefined> = process.env,
) {
  const requested = ["admin", "shopkeeper"].flatMap((role) => {
    const prefix = `LONDOS_BOOTSTRAP_${role.toUpperCase()}`;
    if (!["EMAIL", "PASSWORD", "NAME"].some((key) => env[`${prefix}_${key}`])) return [];
    const parsed = credentials.safeParse({
      email: env[`${prefix}_EMAIL`],
      password: env[`${prefix}_PASSWORD`],
      name: env[`${prefix}_NAME`],
    });
    if (!parsed.success) throw new Error("bootstrap_credentials_invalid");
    return [{ role, ...parsed.data }];
  });
  if (!requested.length) return { created: 0 };
  if (new Set(requested.map((v) => v.email)).size !== requested.length)
    throw new Error("bootstrap_accounts_must_be_distinct");
  const config = coreConfig();
  if (!notificationsConfigured(config)) throw new Error("bootstrap_email_configuration_required");
  let created = 0;
  for (const input of requested) {
    const password = await hashPassword(input.password);
    const token = await createEmailVerificationToken(config.secret, input.email);
    await transaction(pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(91347013)");
      const receipt = (
        await db.query("SELECT 1 FROM bootstrap_accounts WHERE role=$1", [input.role])
      ).rowCount;
      if (receipt) return; // Never overwrite identities, reset credentials or re-grant revoked authority.
      if ((await db.query('SELECT 1 FROM "user" WHERE lower(email)=$1', [input.email])).rowCount)
        throw new Error("bootstrap_existing_identity_refused");
      if (
        input.role === "admin" &&
        (await db.query("SELECT 1 FROM operator_grants LIMIT 1")).rowCount
      )
        throw new Error("bootstrap_existing_operator_refused");
      const id = randomUUID();
      await db.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,false,false)',
        [id, input.name, input.email],
      );
      await db.query(
        'INSERT INTO account(id,"accountId","providerId","userId",password,"updatedAt") VALUES($1,$2,\'credential\',$2,$3,now())',
        [randomUUID(), id, password],
      );
      if (input.role === "admin") {
        await db.query(
          "INSERT INTO operator_grants(user_id,permission) SELECT $1,unnest(ARRAY['support','review','finance','moderation','recovery','jobs','operations','analytics','privacy','costs'])",
          [id],
        );
      } else {
        const merchant = randomUUID(),
          shop = randomUUID(),
          mall = randomUUID();
        await db.query("INSERT INTO malls(id,name) VALUES($1,'Londos')", [mall]);
        await db.query("INSERT INTO merchants(id,name) VALUES($1,$2)", [merchant, input.name]);
        await db.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
          merchant,
          id,
        ]);
        await db.query(
          "INSERT INTO shops(id,merchant_id,mall_id,name,slug) VALUES($1,$2,$3,$4,$5)",
          [shop, merchant, mall, `${input.name}'s shop`.slice(0, 120), `shop-${shop}`],
        );
        await db.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [
          shop,
        ]);
        // Explicit owner-provisioned initial access, not evidence of payment or an invoice.
        await db.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [shop]);
        await db.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [shop]);
      }
      const url = new URL("/api/auth/verify-email", config.baseURL);
      url.searchParams.set("token", token);
      url.searchParams.set(
        "callbackURL",
        `${config.baseURL}/sign-in?next=${input.role === "admin" ? "/landlord" : "/shopkeeper"}`,
      );
      await enqueue(db, {
        kind: "notification.local",
        key: `bootstrap-verification:${id}`,
        payload: { template: "email-verification", to: input.email, url: url.toString() },
      });
      await db.query("INSERT INTO bootstrap_accounts(role,user_id) VALUES($1,$2)", [
        input.role,
        id,
      ]);
      await db.query(
        "INSERT INTO audit_events(id,actor_id,action,resource_id,details) VALUES($1,$2,'account.bootstrapped',$2,$3)",
        [randomUUID(), id, JSON.stringify({ role: input.role })],
      );
      created++;
    });
  }
  return { created };
}
