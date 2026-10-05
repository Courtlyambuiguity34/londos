import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
type Context = { params: Promise<{ shopId: string }> };
import { saveProduct, productInput } from "@/server/catalogue";
export async function POST(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    saveProduct(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      null,
      productInput.parse(await boundedBody(request)),
    ),
  );
}
