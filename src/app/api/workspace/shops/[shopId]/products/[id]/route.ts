import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
type Context = { params: Promise<{ shopId: string; id: string }> };
import { saveProduct, productInput } from "@/server/catalogue";
import { deleteCatalogueItem } from "@/server/catalogue-recovery";
export async function DELETE(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) => {
    const p = await params;
    return deleteCatalogueItem(
      database(),
      actor,
      z.uuid().parse(p.shopId),
      "product",
      z.uuid().parse(p.id),
      await boundedBody(request),
    );
  });
}
export async function PATCH(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) => {
    const p = await params;
    return saveProduct(
      database(),
      actor,
      z.uuid().parse(p.shopId),
      z.uuid().parse(p.id),
      productInput.parse(await boundedBody(request)),
    );
  });
}
