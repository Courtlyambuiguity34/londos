import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { paymentClaimInput, submitPaymentClaim } from "@/server/rent";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    submitPaymentClaim(
      database(),
      actor,
      (await context.params).id,
      paymentClaimInput.parse(await boundedBody(request)),
    ),
  );
}
