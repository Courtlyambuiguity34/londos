import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
type Context = { params: Promise<{ shopId: string; id: string }> };
import { updateGuestRequest, requestStatus } from "@/server/contacts";
export async function PATCH(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) => {
    const p = await params;
    return updateGuestRequest(
      database(),
      actor,
      z.uuid().parse(p.shopId),
      z.uuid().parse(p.id),
      requestStatus.parse(await boundedBody(request)),
    );
  });
}
