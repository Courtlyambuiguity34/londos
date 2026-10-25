import { randomUUID } from "node:crypto";
import { z } from "zod";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { boundedBody, checkOrigin, privateResponse } from "@/server/http";
import { guestInput, submitGuestRequest } from "@/server/contacts";
import { consumeBudget } from "@/server/security/budget";
import { AccessError } from "@/server/security/errors";
import { corsResponse } from "@/server/security/origin";
export async function POST(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  const requestId = randomUUID();
  const respond = (data: unknown, status = 200) =>
    corsResponse(request, privateResponse(data, status, requestId));
  try {
    if (!coreConfigured()) return respond({ error: "core_unavailable" }, 503);
    checkOrigin(request);
    const id = z.uuid().parse((await params).shopId);
    // Use shared budgets until ingress provides a verified client identity.
    // Untrusted forwarded-IP headers must not let guests evade these limits.
    await consumeBudget(database(), "guest:network", 30);
    await consumeBudget(database(), `guest:shop:${id}`, 10);
    return respond(
      await submitGuestRequest(database(), id, guestInput.parse(await boundedBody(request))),
    );
  } catch (error) {
    if (error instanceof AccessError) return respond({ error: error.code }, error.status);
    if (error instanceof z.ZodError) return respond({ error: "invalid_input" }, 422);
    console.error(JSON.stringify({ event: "guest.request.failed", requestId }));
    return respond({ error: "service_unavailable" }, 503);
  }
}
