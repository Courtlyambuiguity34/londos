import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { readOwnerCosts } from "@/server/costs";
import { costWindow } from "@/modules/costs/contract";
export async function GET(request: Request, context: { params: Promise<{ shopId: string }> }) {
  return workspaceRequest(request, async (actor) =>
    readOwnerCosts(
      database(),
      actor,
      (await context.params).shopId,
      costWindow.parse(Number(new URL(request.url).searchParams.get("days") ?? 30)),
    ),
  );
}
