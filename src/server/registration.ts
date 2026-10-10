import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { coreConfig } from "./config";
import { consumeBudget } from "./security/budget";
import { createAuth } from "./security/auth";

export const registrationInput = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: z.string().min(12).max(128),
    acceptTerms: z.literal(true),
  })
  .strict();

export async function registerShopkeeper(pool: Pool, input: z.infer<typeof registrationInput>) {
  const value = registrationInput.parse(input),
    digest = createHash("sha256").update(value.email).digest("hex");
  await consumeBudget(pool, "registration:global", 30);
  await consumeBudget(pool, `registration:${digest}`, 3);
  const configuration = coreConfig();
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
  return { accepted: true as const };
}
