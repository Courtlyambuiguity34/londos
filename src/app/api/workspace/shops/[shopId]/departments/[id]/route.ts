import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
type Context = { params: Promise<{ shopId: string; id: string }> };
import { saveDepartment, departmentInput } from "@/server/catalogue";
import { deleteCatalogueItem } from "@/server/catalogue-recovery";
export async function DELETE(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) => {
    const p = await params;
    return deleteCatalogueItem(
      database(),
      actor,
      z.uuid().parse(p.shopId),
      "department",
      z.uuid().parse(p.id),
      await boundedBody(request),
    );
  });
}
export async function PATCH(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) => {
    const p = await params;
    return saveDepartment(
      database(),
      actor,
      z.uuid().parse(p.shopId),
      z.uuid().parse(p.id),
      departmentInput.parse(await boundedBody(request)),
    );
  });
}
