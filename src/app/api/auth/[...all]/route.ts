import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { boundedBody, privateResponse } from "@/server/http";
import { auth } from "@/server/security/auth";
import { authenticationRequest } from "@/server/security/auth-http";
async function handle(request: Request) {
  if (!coreConfigured()) return privateResponse({ error: "core_unavailable" }, 503);
  try {
    return await authenticationRequest(request, auth(), database(), boundedBody);
  } catch {
    return privateResponse({ error: "service_unavailable" }, 503);
  }
}
export { handle as GET, handle as POST };
