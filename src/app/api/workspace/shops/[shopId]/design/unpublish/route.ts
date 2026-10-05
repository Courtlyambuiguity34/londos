import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { unpublishDesign, unpublishDesignInput } from "@/server/shop-design";
export async function POST(request: Request, context: { params: Promise<{ shopId: string }> }) {
  return workspaceRequest(request, async (actor) => {
    const shopId = z.uuid().parse((await context.params).shopId);
    return unpublishDesign(
      database(),
      actor,
      shopId,
      unpublishDesignInput.parse(await boundedBody(request)),
    );
  });
}
