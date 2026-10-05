import { randomUUID } from "node:crypto";
import { z } from "zod";
import { coreConfigured, coreConfig } from "@/server/config";
import { database } from "@/server/db/pool";
import { boundedBody, checkOrigin, privateResponse } from "@/server/http";
import { guestInput, submitGuestRequest } from "@/server/contacts";
import { consumeBudget } from "@/server/security/budget";
import { AccessError } from "@/server/security/errors";
export async function POST(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  const requestId = randomUUID();
  try {
    if (!coreConfigured() || !coreConfig().localAdapters)
      return privateResponse({ error: "core_unavailable" }, 503, requestId);
    checkOrigin(request);
    const id = z.uuid().parse((await params).shopId);
    // Ignore client-supplied IP headers in the current loopback deployment.
    await consumeBudget(database(), "guest:network", 30);
    await consumeBudget(database(), `guest:shop:${id}`, 10);
    return privateResponse(
      await submitGuestRequest(database(), id, guestInput.parse(await boundedBody(request))),
      200,
      requestId,
    );
  } catch (error) {
    if (error instanceof AccessError)
      return privateResponse({ error: error.code }, error.status, requestId);
    if (error instanceof z.ZodError)
      return privateResponse({ error: "invalid_input" }, 422, requestId);
    console.error(JSON.stringify({ event: "guest.request.failed", requestId }));
    return privateResponse({ error: "service_unavailable" }, 503, requestId);
  }
}
