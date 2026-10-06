import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { readCostJournal, writeCostEntry } from "@/server/costs";
import { costCommand, costWindow, costCursor } from "@/modules/costs/contract";
type Context = { params: Promise<{ shopId: string }> };
export async function GET(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) => {
    const q = new URL(request.url).searchParams;
    return readCostJournal(
      database(),
      actor,
      (await context.params).shopId,
      costWindow.parse(Number(q.get("days") ?? 30)),
      costCursor.parse(q.get("after")),
    );
  });
}
export async function POST(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) =>
    writeCostEntry(
      database(),
      actor,
      (await context.params).shopId,
      costCommand.parse(await boundedBody(request)),
    ),
  );
}
