import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { applyPromotion, promotionRedemptionInput } from "@/server/rent";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    applyPromotion(
      database(),
      actor,
      (await context.params).id,
      promotionRedemptionInput.parse(await boundedBody(request)),
    ),
  );
}
