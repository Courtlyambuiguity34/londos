import "server-only";
import { z } from "zod";
import { coreConfigured, coreConfig } from "./config";
import { database } from "./db/pool";
import { checkOrigin, privateResponse } from "./http";
import { consumeBudget } from "./security/budget";
import { AccessError } from "./security/errors";
import { corsResponse } from "./security/origin";
export async function reportRequest(request: Request, work: () => Promise<unknown>) {
  const respond = (data: unknown, status = 200) =>
    corsResponse(request, privateResponse(data, status));
  try {
    if (!coreConfigured() || !coreConfig().localAdapters)
      return respond({ error: "core_unavailable" }, 503);
    checkOrigin(request);
    // No client IP headers are trusted in the loopback development adapter.
    await consumeBudget(database(), "trust:network", 60);
    return respond(await work());
  } catch (error) {
    if (error instanceof AccessError) return respond({ error: error.code }, error.status);
    if (error instanceof z.ZodError) return respond({ error: "invalid_input" }, 422);
    console.error(JSON.stringify({ event: "trust.intake.failed" }));
    return respond({ error: "service_unavailable" }, 503);
  }
}
