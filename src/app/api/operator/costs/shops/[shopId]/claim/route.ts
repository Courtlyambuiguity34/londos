import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { claimCostScope } from "@/server/costs";
import { costClaim } from "@/modules/costs/contract";
type Context = { params: Promise<{ shopId: string }> };
export async function POST(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) =>
    claimCostScope(
      database(),
      actor,
      (await context.params).shopId,
      costClaim.parse(await boundedBody(request)),
    ),
  );
}
