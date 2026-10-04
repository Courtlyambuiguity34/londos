import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { randomUUID, createHash } from "node:crypto";
import type { Pool } from "pg";
import { coreConfig } from "../config";
import { database, transaction } from "../db/pool";
import { enqueue } from "../jobs/enqueue";
import { audit } from "./audit";

export function createAuth(pool: Pool, config: ReturnType<typeof coreConfig>, bootstrap = false) {
  if (!config.localAdapters)
    throw new Error(
      "X1 requires explicit loopback local notification adapters. Live delivery must be implemented before remote authentication.",
    );
  return betterAuth({
    appName: "Londos",
    baseURL: config.baseURL,
    secret: config.secret,
    database: pool,
    trustedOrigins: [config.baseURL],
    telemetry: { enabled: false },
    logger: { disabled: true },
    advanced: {
      useSecureCookies: config.secureCookies,
      cookiePrefix: "londos",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      ipAddress: { ipAddressHeaders: ["x-londos-client-ip"] },
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
      freshAge: 300,
      cookieCache: { enabled: false },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !bootstrap,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await enqueue(pool, {
          kind: "notification.local",
          key: `password-reset:${randomUUID()}`,
          payload: { to: user.email, template: "password-reset", url },
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await enqueue(pool, {
          kind: "notification.local",
          key: `email-verification:${randomUUID()}`,
          payload: { to: user.email, template: "email-verification", url },
        });
      },
    },
    // The loopback server has one network identity; the HTTP adapter adds an
    // atomic per-account limit (10 sign-ins / 3 recoveries per minute).
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 90,
      customRules: {
        "/sign-in/email": { window: 60, max: 60 },
        "/request-password-reset": { window: 60, max: 15 },
      },
    },
    plugins: [
      twoFactor({
        issuer: "Londos",
        backupCodeOptions: { storeBackupCodes: "encrypted" },
        accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 },
      }),
    ],
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (!["/two-factor/verify-totp", "/two-factor/verify-backup-code"].includes(ctx.path))
          return;
        // Only the library's successful, server-produced result can create a proof.
        const result = ctx.context.returned as { token?: unknown } | undefined;
        if (!result || typeof result.token !== "string") return;
        // Enrollment rotates the cookie session while the endpoint result still names
        // its preceding session. Bind the proof to the library's rotated session.
        const token = ctx.context.newSession?.session.token ?? result.token;
        const method = ctx.path.endsWith("verify-totp") ? "totp" : "backup";
        const recorded = await transaction(pool, async (client) => {
          const verified = (
            await client.query(
              `SELECT s.id,s."userId" AS user_id FROM session s JOIN "user" u ON u.id=s."userId" JOIN "twoFactor" f ON f."userId"=u.id WHERE s.token=$1 AND u."twoFactorEnabled"=true AND f.verified=true AND s."expiresAt">now()`,
              [token],
            )
          ).rows[0] as { id: string; user_id: string } | undefined;
          if (!verified) return false;
          if (method === "totp") {
            const code = ctx.body?.code;
            if (typeof code !== "string") return false;
            const hash = createHash("sha256").update(code).digest("hex");
            const receipt = await client.query(
              "INSERT INTO mfa_code_receipts(user_id,code_hash,expires_at) VALUES($1,$2,now()+interval '120 seconds') ON CONFLICT(user_id,code_hash) DO UPDATE SET expires_at=excluded.expires_at WHERE mfa_code_receipts.expires_at<now() RETURNING user_id",
              [verified.user_id, hash],
            );
            if (!receipt.rowCount) return false;
          }
          await client.query(
            "INSERT INTO mfa_proofs(session_id,user_id,verified_at,method) VALUES($1,$2,now(),$3) ON CONFLICT(session_id) DO UPDATE SET verified_at=excluded.verified_at,method=excluded.method",
            [verified.id, verified.user_id, method],
          );
          await audit(
            client,
            { userId: verified.user_id, sessionId: verified.id },
            "authentication.mfa.verified",
            verified.id,
            undefined,
            { method },
          );
          return true;
        });
        if (!recorded) {
          // A replay must not leave the newly issued session usable.
          if (ctx.context.newSession)
            await pool.query("DELETE FROM session WHERE token=$1", [token]);
          throw new APIError("UNAUTHORIZED", {
            code: "MFA_CODE_REUSED",
            message: "Use a new authenticator code.",
          });
        }
      }),
    },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function auth() {
  return (instance ??= createAuth(database(), coreConfig()));
}
export type Auth = ReturnType<typeof createAuth>;
