import { z } from "zod";
import { captureInput } from "@/modules/analytics/contract";
import { coreConfigured } from "@/server/config";
import {
  storePilotEvent,
  pilotDatabase,
  pilotPolicy,
  excludedPilotTraffic,
} from "@/server/analytics";
import { boundedBody, checkOrigin, privateResponse } from "@/server/http";
import { AccessError } from "@/server/security/errors";
import { corsResponse } from "@/server/security/origin";
export async function POST(request: Request) {
  const respond = (data: unknown, status = 200) =>
    corsResponse(request, privateResponse(data, status));
  const receipt = () => respond({ received: true }, 202);
  if (!coreConfigured()) return receipt();
  try {
    checkOrigin(request);
    if (!pilotPolicy().enabled || excludedPilotTraffic(request.headers)) return receipt();
    const input = captureInput.parse(await boundedBody(request));
    await storePilotEvent(pilotDatabase(), request.headers, input);
    return receipt();
  } catch (error) {
    if (error instanceof z.ZodError) return respond({ error: "invalid_input" }, 422);
    if (error instanceof AccessError && [403, 422].includes(error.status))
      return respond({ error: error.code }, error.status);
    // No target, token, query, driver details or storage outcome enter this response/log.
    return receipt();
  }
}
