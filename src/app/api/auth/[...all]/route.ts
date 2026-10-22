import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { boundedBody, privateResponse } from "@/server/http";
import { auth } from "@/server/security/auth";
import { authenticationRequest } from "@/server/security/auth-http";
import { corsResponse } from "@/server/security/origin";
import { randomUUID } from "node:crypto";
import { failureCategory } from "@/server/diagnostics";
async function handle(request: Request) {
  if (!coreConfigured())
    return corsResponse(request, privateResponse({ error: "core_unavailable" }, 503));
  try {
    return await authenticationRequest(request, auth(), database(), boundedBody);
  } catch (error) {
    const requestId = randomUUID();
    console.error(
      JSON.stringify({
        event: "authentication.failed",
        requestId,
        category: failureCategory(error),
      }),
    );
    const result = privateResponse({ error: "service_unavailable" }, 503);
    result.headers.set("X-Request-ID", requestId);
    return corsResponse(request, result);
  }
}
export { handle as GET, handle as POST };
