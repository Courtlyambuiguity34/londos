import { randomUUID } from "node:crypto";
import { z } from "zod";
import { savedShopsInput } from "@/modules/discovery/saved-contract";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { PostgresSearch } from "@/server/discovery";
import { boundedBody, privateResponse } from "@/server/http";
import { failureCategory } from "@/server/diagnostics";
import { consumeBudget } from "@/server/security/budget";
import { AccessError } from "@/server/security/errors";
import { corsResponse, requireAcceptedOrigin } from "@/server/security/origin";

// A public read, never an account mutation. Do not log saved IDs or return
// missing/restricted identities. The normal public eligibility gates apply.
export async function POST(request: Request) {
  const requestId = randomUUID();
  const respond = (data: unknown, status = 200) =>
    corsResponse(request, privateResponse(data, status, requestId));
  try {
    if (!coreConfigured()) return respond({ error: "core_unavailable" }, 503);
    requireAcceptedOrigin(request);
    const { ids } = savedShopsInput.parse(await boundedBody(request));
    if (!ids.length) return respond({ results: [] });
    await consumeBudget(database(), "public:saved-shops:global", 300);
    const service = new PostgresSearch(database());
    const first = await service.search({ query: "", shopIds: ids, limit: 20 });
    const second = first.nextCursor
      ? await service.search({ query: "", shopIds: ids, cursor: first.nextCursor, limit: 20 })
      : null;
    return respond({ results: [...first.results, ...(second?.results ?? [])] });
  } catch (error) {
    if (error instanceof AccessError) return respond({ error: error.code }, error.status);
    if (error instanceof z.ZodError) return respond({ error: "invalid_input" }, 422);
    console.error(
      JSON.stringify({ event: "saved_shops.failed", requestId, category: failureCategory(error) }),
    );
    return respond({ error: "service_unavailable" }, 503);
  }
}
