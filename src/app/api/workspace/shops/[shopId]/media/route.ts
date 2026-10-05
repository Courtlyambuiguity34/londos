import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
type Context = { params: Promise<{ shopId: string }> };
import { listMedia, startUpload, uploadInput } from "@/server/media";
export async function GET(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    listMedia(database(), actor, z.uuid().parse((await params).shopId)),
  );
}
export async function POST(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    startUpload(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      uploadInput.parse(await boundedBody(request)),
    ),
  );
}
