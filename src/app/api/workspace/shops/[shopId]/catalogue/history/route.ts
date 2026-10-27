import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { readCatalogueHistory, catalogueHistoryAction } from "@/server/catalogue-recovery";
type Context = { params: Promise<{ shopId: string }> };
export async function GET(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) => {
    const query = new URL(request.url).searchParams;
    return readCatalogueHistory(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      Number(query.get("offset") ?? 0),
      Number(query.get("deletedOffset") ?? 0),
    );
  });
}
export async function POST(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    catalogueHistoryAction(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      await boundedBody(request),
    ),
  );
}
