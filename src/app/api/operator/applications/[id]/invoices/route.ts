import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { applicationInvoices } from "@/server/rent";
export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    applicationInvoices(
      database(),
      actor,
      (await context.params).id,
      "finance",
      Number(new URL(request.url).searchParams.get("offset") ?? 0),
    ),
  );
}
