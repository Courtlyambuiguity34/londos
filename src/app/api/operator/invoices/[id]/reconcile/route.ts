import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { reconcileInvoice, reconcileInput } from "@/server/rent";
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    reconcileInvoice(
      database(),
      actor,
      (await context.params).id,
      reconcileInput.parse(await boundedBody(request)),
    ),
  );
}
