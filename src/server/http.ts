import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { coreConfigured } from "./config";
import { database } from "./db/pool";
import { auth } from "./security/auth";
import { resolveActor, type Actor } from "./security/authorization";
import { consumeBudget } from "./security/budget";
import { AccessError } from "./security/errors";
import { corsResponse, requireAcceptedOrigin } from "./security/origin";

export function privateResponse(data: unknown, status = 200, requestId = randomUUID()) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
      "X-Request-ID": requestId,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export function checkOrigin(request: Request) {
  requireAcceptedOrigin(request);
}
export async function boundedBody(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > 8192) throw new AccessError(422, "request_too_large");
  if (
    (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw new AccessError(422, "json_required");
  if (!request.body) throw new AccessError(422, "json_required");
  const bytes = await boundedBytes(request, 8192);
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new AccessError(422, "invalid_json");
  }
}
export async function workspaceRequest(request: Request, work: (actor: Actor) => Promise<unknown>) {
  const requestId = randomUUID();
  const respond = (data: unknown, status = 200) =>
    corsResponse(request, privateResponse(data, status, requestId));
  try {
    if (!coreConfigured()) return respond({ error: "core_unavailable" }, 503);
    if (!["GET", "HEAD"].includes(request.method)) checkOrigin(request);
    const actor = await resolveActor(auth(), request.headers);
    if (!["GET", "HEAD"].includes(request.method))
      await consumeBudget(database(), `workspace:${actor.userId}`, 60);
    const result = await work(actor);
    if (result instanceof Response) {
      for (const [key, value] of privateResponse(null, 200, requestId).headers)
        if (key !== "content-type") result.headers.set(key, value);
      return corsResponse(request, result);
    }
    return respond(result);
  } catch (error) {
    if (error instanceof AccessError) return respond({ error: error.code }, error.status);
    if (error instanceof z.ZodError) return respond({ error: "invalid_input" }, 422);
    console.error(JSON.stringify({ event: "request.failed", requestId, method: request.method, route: new URL(request.url).pathname, errorType: error instanceof Error ? error.name : "unknown", databaseCode: typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined, constraint: typeof error === "object" && error !== null && "constraint" in error && typeof error.constraint === "string" ? error.constraint : undefined }));
    return respond({ error: "service_unavailable" }, 503);
  }
}

export async function boundedBytes(request: Request, limit: number) {
  if (Number(request.headers.get("content-length") ?? 0) > limit)
    throw new AccessError(422, "request_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(422, "upload_required");
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (signal.aborted) abort();
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new AccessError(422, "request_too_large");
      }
      chunks.push(value);
    }
    signal.throwIfAborted();
    return Buffer.concat(chunks);
  } catch (error) {
    if (signal.aborted)
      throw new AccessError(
        408,
        request.signal.aborted ? "request_body_cancelled" : "request_body_timeout",
      );
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
