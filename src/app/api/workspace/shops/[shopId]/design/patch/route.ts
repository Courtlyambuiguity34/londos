import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { patchDesign, patchDesignInput } from "@/server/shop-design";
export async function POST(request: Request, context: { params: Promise<{ shopId: string }> }) {
  return workspaceRequest(request, async (actor) => {
    const shopId = z.uuid().parse((await context.params).shopId);
    return patchDesign(
      database(),
      actor,
      shopId,
      patchDesignInput.parse(await boundedBody(request)),
    );
  });
}
