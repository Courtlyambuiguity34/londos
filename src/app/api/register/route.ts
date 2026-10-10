import { randomUUID } from "node:crypto";
import { z } from "zod";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { boundedBody, privateResponse } from "@/server/http";
import { registerShopkeeper, registrationInput } from "@/server/registration";
import { AccessError } from "@/server/security/errors";
import { corsResponse, requireAcceptedOrigin } from "@/server/security/origin";

export async function POST(request: Request) {
  const requestId = randomUUID();
  const respond = (data: unknown, status: number) =>
    corsResponse(request, privateResponse(data, status, requestId));
  try {
    if (!coreConfigured()) return respond({ error: "core_unavailable" }, 503);
    requireAcceptedOrigin(request);
    const result = await registerShopkeeper(
      database(),
      registrationInput.parse(await boundedBody(request)),
    );
    return respond(result, 202);
  } catch (error) {
    if (error instanceof AccessError) return respond({ error: error.code }, error.status);
    if (error instanceof z.ZodError) return respond({ error: "invalid_input" }, 422);
    console.error(JSON.stringify({ event: "registration.failed", requestId }));
    return respond({ error: "service_unavailable" }, 503);
  }
}
