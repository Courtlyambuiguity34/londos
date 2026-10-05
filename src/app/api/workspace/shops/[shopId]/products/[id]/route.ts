import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
type Context = { params: Promise<{ shopId: string; id: string }> };
import { saveProduct, productInput } from "@/server/catalogue";
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
