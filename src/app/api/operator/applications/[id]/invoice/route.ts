import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { issueApplicationInvoice, issueApplicationInvoiceInput } from "@/server/rent";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    issueApplicationInvoice(database(), actor, (await context.params).id, issueApplicationInvoiceInput.parse(await boundedBody(request))),
  );
}
