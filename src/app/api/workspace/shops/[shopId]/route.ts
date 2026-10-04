import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { changeProfile, profileChange, readShop } from "@/server/workspace";
type Context = { params: Promise<{ shopId: string }> };
export async function GET(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    readShop(database(), actor, z.uuid().parse((await params).shopId)),
  );
}
export async function PATCH(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    changeProfile(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      profileChange.parse(await boundedBody(request)),
    ),
  );
}
