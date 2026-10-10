import { coreConfig } from "../config";
import { AccessError } from "./errors";

export function acceptedRequestOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (
    !origin ||
    request.headers.get("sec-fetch-site") === "cross-site" ||
    !coreConfig().allowedOrigins.includes(origin)
  )
    return null;
  return origin;
}

export function requireAcceptedOrigin(request: Request) {
  if (!acceptedRequestOrigin(request)) throw new AccessError(403, "origin_denied");
}

export function corsResponse<T extends Response>(request: Request, response: T): T {
  const origin = acceptedRequestOrigin(request);
  if (!origin) return response;
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.append("Vary", "Origin");
  return response;
}
