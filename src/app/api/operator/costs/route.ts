import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { readOperatorCosts } from "@/server/costs";
import { costWindow, costCursor } from "@/modules/costs/contract";
export async function GET(request: Request) {
  return workspaceRequest(request, (actor) => {
    const q = new URL(request.url).searchParams;
    return readOperatorCosts(
      database(),
      actor,
      costWindow.parse(Number(q.get("days") ?? 30)),
      costCursor.parse(q.get("after")),
    );
  });
}
