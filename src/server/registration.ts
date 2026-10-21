import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { coreConfig } from "./config";
import { consumeBudget } from "./security/budget";
import { createAuth } from "./security/auth";
import { notificationsConfigured } from "./jobs/brevo";
import { AccessError } from "./security/errors";

export const registrationInput = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z
      .string()
      .trim()
      .max(254)
      .pipe(z.email())
      .transform((value) => value.toLowerCase()),
    password: z.string().min(12).max(128),
    acceptTerms: z.literal(true),
  })
  .strict();

export async function registerShopkeeper(pool: Pool, input: z.infer<typeof registrationInput>) {
  const value = registrationInput.parse(input),
    digest = createHash("sha256").update(value.email).digest("hex");
  const configuration = coreConfig();
  if (!notificationsConfigured(configuration))
    throw Object.assign(new Error("Email configuration unavailable"), {
      code: "EMAIL_CONFIGURATION_INVALID",
    });
  await consumeBudget(pool, "registration:global", 30);
  await consumeBudget(pool, `registration:${digest}`, 3);
  const authentication = createAuth(pool, configuration, true);
  const response = await authentication.handler(
    new Request(`${configuration.baseURL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { Origin: configuration.baseURL, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: value.name,
        email: value.email,
        password: value.password,
        callbackURL: "/shopkeeper",
      }),
    }),
  );
  // Duplicate identities and accepted registrations intentionally return the same public result.
  // A new unverified account has no membership or operator grant and cannot resolve an Actor.
  if (response.status >= 500) throw new Error("registration_unavailable");
  if (response.status === 429) throw new AccessError(429, "rate_limit_exceeded");
  if (response.status === 403) throw new AccessError(403, "registration_origin_rejected");
  if (response.status >= 400 && response.status !== 409)
    throw new AccessError(422, "invalid_input");
  if (response.ok) {
    const result = (await response.json()) as { user?: { id?: string } };
    if (typeof result.user?.id === "string")
      await pool.query(
        `INSERT INTO account_policy_acceptances(user_id,policy_version)
         SELECT id,'2026-10-21' FROM "user" WHERE id=$1 AND email=$2 ON CONFLICT DO NOTHING`,
        [result.user.id, value.email],
      );
  }
  return { accepted: true as const };
}
