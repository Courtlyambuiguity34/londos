import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { moveCatalogueItem } from "@/server/catalogue-arrangement";
import { catalogueMove } from "@/modules/catalogue-tools";
export async function POST(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  return workspaceRequest(request, async (actor) =>
    moveCatalogueItem(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      catalogueMove.parse(await boundedBody(request)),
    ),
  );
}
