import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { publishDesign, publishDesignInput } from "@/server/shop-design";
export async function POST(request: Request, context: { params: Promise<{ shopId: string }> }) {
  return workspaceRequest(request, async (actor) => {
    const shopId = z.uuid().parse((await context.params).shopId);
    return publishDesign(
      database(),
      actor,
      shopId,
      publishDesignInput.parse(await boundedBody(request)),
    );
  });
}
