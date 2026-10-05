import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { rollbackDesign, rollbackDesignInput } from "@/server/shop-design";
export async function POST(request: Request, context: { params: Promise<{ shopId: string }> }) {
  return workspaceRequest(request, async (actor) => {
    const shopId = z.uuid().parse((await context.params).shopId);
    return rollbackDesign(
      database(),
      actor,
      shopId,
      rollbackDesignInput.parse(await boundedBody(request)),
    );
  });
}
