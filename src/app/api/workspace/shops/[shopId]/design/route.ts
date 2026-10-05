import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { readDesign, saveDesign, saveDesignInput } from "@/server/shop-design";
export async function GET(request: Request, context: { params: Promise<{ shopId: string }> }) {
  return workspaceRequest(request, async (actor) => {
    const shopId = z.uuid().parse((await context.params).shopId);
    return readDesign(database(), actor, shopId);
  });
}
export async function PUT(request: Request, context: { params: Promise<{ shopId: string }> }) {
  return workspaceRequest(request, async (actor) => {
    const shopId = z.uuid().parse((await context.params).shopId);
    return saveDesign(database(), actor, shopId, saveDesignInput.parse(await boundedBody(request)));
  });
}
