import { betterAuth } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx, APIError } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { randomUUID, createHash } from "node:crypto";
import type { Pool } from "pg";
import { coreConfig } from "../config";
import { database, transaction } from "../db/pool";
import { enqueue } from "../jobs/enqueue";
import { audit } from "./audit";
import { notificationsConfigured } from "../jobs/brevo";

const observationKey = Symbol("londosAuthenticationObservation");
type AuthenticationObservation = { user_id: string; auth_epoch: string; factor_id: string | null };
type ObservedContext = { [observationKey]?: AuthenticationObservation };
const factorVerification = new Set(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);

export function createAuth(pool: Pool, config: ReturnType<typeof coreConfig>, bootstrap = false) {
  if (!config.localAdapters && !notificationsConfigured(config))
    throw new Error(
      "Remote authentication requires explicitly configured Brevo notification delivery.",
    );
  return betterAuth({
    appName: "Londos",
    baseURL: config.baseURL,
    secret: config.secret,
    database: pool,
    trustedOrigins: config.allowedOrigins,
    telemetry: { enabled: false },
    logger: { disabled: true },
    advanced: {
      // Better Auth otherwise skips origin validation when NODE_ENV=test.
      // Security tests and the production handler must enforce the same policy.
      disableOriginCheck: false,
      disableCSRFCheck: false,
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
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }, request) => {
        const jobId = await enqueue(pool, {
          kind: "notification.local",
          key: `email-verification:${randomUUID()}`,
          payload: { to: user.email, template: "email-verification", url },
        });
        const reference = request?.headers.get("x-londos-request-id");
        console.info(
          JSON.stringify({
            event: "verification.queued",
            jobId,
            ...(reference && /^[a-f0-9-]{36}$/.test(reference) ? { requestId: reference } : {}),
          }),
        );
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
      before: createAuthMiddleware(async (ctx) => {
        let userId: string | undefined;
        if (factorVerification.has(ctx.path)) {
          const session = await getSessionFromCtx(ctx);
          userId = session?.user.id;
          if (!userId) {
            // Use the library's signed challenge cookie and verification adapter.
            // This observes its identity; only the library can verify the factor.
            const cookie = ctx.context.createAuthCookie("two_factor");
            const identifier = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
            if (identifier)
              userId = (await ctx.context.internalAdapter.findVerificationValue(identifier))?.value;
          }
        } else if (ctx.path !== "/sign-in/email") return;
        const email =
          ctx.path === "/sign-in/email" && typeof ctx.body?.email === "string"
            ? ctx.body.email.toLowerCase()
            : null;
        if (!userId && !email) return;
        const snapshot = (
          await pool.query(
            `SELECT u.id AS user_id,u.auth_epoch,f.id AS factor_id,coalesce((to_jsonb(u)->>'demo_retired')::boolean,false) AS demo_retired FROM "user" u
           LEFT JOIN "twoFactor" f ON f."userId"=u.id
           WHERE ($1::text IS NOT NULL AND u.id=$1) OR ($2::text IS NOT NULL AND u.email=$2)`,
            [userId ?? null, email],
          )
        ).rows[0] as (AuthenticationObservation & { demo_retired: boolean }) | undefined;
        if (snapshot?.demo_retired)
          throw new APIError("UNAUTHORIZED", {
            message: "This demonstration account has been retired.",
          });
        if (snapshot) (ctx.context as ObservedContext)[observationKey] = snapshot;
      }),
      after: createAuthMiddleware(async (ctx) => {
        const snapshot = (ctx.context as ObservedContext)[observationKey];
        const result = ctx.context.returned as
          { token?: unknown; twoFactorRedirect?: unknown } | undefined;
        if (
          ctx.path === "/sign-in/email" &&
          result &&
          (typeof result.token === "string" || result.twoFactorRedirect === true)
        ) {
          const current =
            snapshot &&
            (await pool.query('SELECT 1 FROM "user" WHERE id=$1 AND auth_epoch=$2', [
              snapshot.user_id,
              snapshot.auth_epoch,
            ]));
          if (!current?.rowCount) {
            if (ctx.context.newSession)
              await pool.query("DELETE FROM session WHERE token=$1", [
                ctx.context.newSession.session.token,
              ]);
            if (snapshot && result.twoFactorRedirect === true)
              await pool.query(
                "DELETE FROM verification WHERE value=$1 AND identifier LIKE '2fa-%'",
                [snapshot.user_id],
              );
            throw new APIError("UNAUTHORIZED", {
              code: "AUTHENTICATION_CHANGED",
              message: "Authentication changed. Sign in again.",
            });
          }
          return;
        }
        if (!factorVerification.has(ctx.path)) return;
        // Only the library's successful, server-produced result can create a proof.
        if (!result || typeof result.token !== "string") return;
        // Enrollment rotates the cookie session while the endpoint result still names
        // its preceding session. Bind the proof to the library's rotated session.
        const token = ctx.context.newSession?.session.token ?? result.token;
        const method = ctx.path.endsWith("verify-totp") ? "totp" : "backup";
        const recorded = await transaction(pool, async (client) => {
          if (!snapshot?.factor_id) return "changed";
          const verified = (
            await client.query(
              `SELECT s.id,s."userId" AS user_id FROM session s JOIN "user" u ON u.id=s."userId" JOIN "twoFactor" f ON f."userId"=u.id
               WHERE s.token=$1 AND u.id=$2 AND u.auth_epoch=$3 AND f.id=$4
               AND u."twoFactorEnabled"=true AND f.verified=true AND s."expiresAt">clock_timestamp()`,
              [token, snapshot.user_id, snapshot.auth_epoch, snapshot.factor_id],
            )
          ).rows[0] as { id: string; user_id: string } | undefined;
          if (!verified) return "changed";
          if (method === "totp") {
            const code = ctx.body?.code;
            if (typeof code !== "string") return "changed";
            const hash = createHash("sha256").update(code).digest("hex");
            const receipt = await client.query(
              "INSERT INTO mfa_code_receipts(user_id,code_hash,expires_at) VALUES($1,$2,now()+interval '120 seconds') ON CONFLICT(user_id,code_hash) DO UPDATE SET expires_at=excluded.expires_at WHERE mfa_code_receipts.expires_at<now() RETURNING user_id",
              [verified.user_id, hash],
            );
            if (!receipt.rowCount) return "replayed";
          }
          await client.query(
            "INSERT INTO mfa_proofs(session_id,user_id,verified_at,method,factor_id,auth_epoch) VALUES($1,$2,clock_timestamp(),$3,$4,$5) ON CONFLICT(session_id) DO UPDATE SET verified_at=excluded.verified_at,method=excluded.method,factor_id=excluded.factor_id,auth_epoch=excluded.auth_epoch",
            [verified.id, verified.user_id, method, snapshot.factor_id, snapshot.auth_epoch],
          );
          await audit(
            client,
            { userId: verified.user_id, sessionId: verified.id },
            "authentication.mfa.verified",
            verified.id,
            undefined,
            { method },
          );
          return "recorded";
        });
        if (recorded !== "recorded") {
          // A replay must not leave the newly issued session usable.
          if (ctx.context.newSession)
            await pool.query("DELETE FROM session WHERE token=$1", [token]);
          throw new APIError("UNAUTHORIZED", {
            code: recorded === "replayed" ? "MFA_CODE_REUSED" : "AUTHENTICATION_CHANGED",
            message:
              recorded === "replayed"
                ? "Use a new authenticator code."
                : "Authentication changed. Sign in again.",
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
