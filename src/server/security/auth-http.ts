import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Auth } from "./auth";
import { coreConfig } from "../config";
import { consumeBudget } from "./budget";
import { resolveActor, requireStepUp } from "./authorization";
import { AccessError } from "./errors";

const allowed = new Set([
  "/sign-in/email",
  "/sign-out",
  "/get-session",
  "/request-password-reset",
  "/reset-password",
  "/verify-email",
  "/send-verification-email",
  "/change-password",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/two-factor/enable",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/two-factor/get-totp-uri",
  "/two-factor/generate-backup-codes",
  "/two-factor/disable",
]);
function response(data: unknown, status: number) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
export async function authenticationRequest(
  request: Request,
  authentication: Auth,
  pool: Pool,
  readBody: (request: Request) => Promise<unknown>,
) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
  if (!allowed.has(path)) return response({ error: "endpoint_unavailable" }, 404);
  try {
    const config = coreConfig();
    let body: Record<string, unknown> | undefined;
    if (request.method === "POST") {
      if (
        request.headers.get("origin") !== config.baseURL ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        throw new AccessError(403, "origin_denied");
      const parsed = await readBody(request);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new AccessError(422, "invalid_input");
      body = parsed as Record<string, unknown>;
      if (path === "/change-password") body.revokeOtherSessions = true;
      await consumeBudget(pool, "auth:global", 300);
      if (typeof body.email === "string") {
        const key = createHash("sha256").update(body.email.toLowerCase()).digest("hex");
        await consumeBudget(
          pool,
          `auth:${path}:${key}`,
          path === "/request-password-reset" ? 3 : 10,
        );
      }
      if (
        body.trustDevice === true ||
        body.disableSession === true ||
        (path === "/two-factor/enable" && body.method !== undefined && body.method !== "totp")
      )
        throw new AccessError(422, "unsupported_authentication_option");
      if (
        [
          "/two-factor/disable",
          "/two-factor/get-totp-uri",
          "/two-factor/generate-backup-codes",
          "/change-password",
          "/revoke-session",
          "/revoke-sessions",
          "/revoke-other-sessions",
        ].includes(path)
      ) {
        const actor = await resolveActor(authentication, request.headers);
        await requireStepUp(pool, actor);
        if (
          path === "/two-factor/disable" &&
          (await pool.query("SELECT 1 FROM operator_grants WHERE user_id=$1", [actor.userId]))
            .rowCount
        )
          throw new AccessError(403, "operator_mfa_mandatory");
      }
    } else if (request.method !== "GET") return response({ error: "method_unavailable" }, 405);
    if (path === "/list-sessions")
      await requireStepUp(pool, await resolveActor(authentication, request.headers));
    const headers = new Headers(request.headers);
    headers.delete("x-forwarded-for");
    headers.delete("x-real-ip");
    headers.set("x-londos-client-ip", "127.0.0.1");
    // Loopback-only X1: ignore client-supplied IPs. Deployment must configure a trusted edge.
    const forwarded = new Request(request.url, {
      method: request.method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await authentication.handler(forwarded);
    result.headers.set("Cache-Control", "private, no-store, max-age=0");
    result.headers.set("Vary", "Cookie");
    result.headers.set("X-Request-ID", randomUUID());
    return result;
  } catch (error) {
    if (error instanceof AccessError) return response({ error: error.code }, error.status);
    console.error(JSON.stringify({ event: "authentication.failed", requestId: randomUUID() }));
    return response({ error: "service_unavailable" }, 503);
  }
}
