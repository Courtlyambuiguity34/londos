import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { rejectPaymentClaim, rejectPaymentClaimInput } from "@/server/rent";

export function POST(
  request: Request,
  context: { params: Promise<{ id: string; claimId: string }> },
) {
  return workspaceRequest(request, async (actor) => {
    const { id, claimId } = await context.params;
    return rejectPaymentClaim(
      database(),
      actor,
      id,
      claimId,
      rejectPaymentClaimInput.parse(await boundedBody(request)),
    );
  });
}
