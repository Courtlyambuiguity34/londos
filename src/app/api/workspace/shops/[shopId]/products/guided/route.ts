import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { guidedProductInput, saveGuidedProduct } from "@/server/guided-product";
export async function POST(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  return workspaceRequest(request, async (actor) =>
    saveGuidedProduct(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      guidedProductInput.parse(await boundedBody(request)),
    ),
  );
}
