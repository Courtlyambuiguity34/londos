import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { readInvoice } from "@/server/rent";
export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    readInvoice(database(), actor, (await context.params).id, "owner"),
  );
}
