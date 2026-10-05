import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
type Context = { params: Promise<{ shopId: string; id: string }> };
import { boundedBytes } from "@/server/http";
import {
  uploadAuthority,
  finishUpload,
  deleteMedia,
  retryMedia,
  mediaVersion,
} from "@/server/media";
export async function PUT(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) => {
    const p = await params,
      shop = z.uuid().parse(p.shopId),
      id = z.uuid().parse(p.id),
      limit = await uploadAuthority(database(), actor, shop, id);
    return finishUpload(
      database(),
      actor,
      shop,
      id,
      await boundedBytes(request, limit.declared_bytes),
      request.headers.get("content-type") ?? "",
    );
  });
}
export async function DELETE(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) => {
    const p = await params,
      v = mediaVersion.parse(await boundedBody(request));
    return deleteMedia(
      database(),
      actor,
      z.uuid().parse(p.shopId),
      z.uuid().parse(p.id),
      v.version,
    );
  });
}
export async function POST(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) => {
    const p = await params,
      v = mediaVersion.parse(await boundedBody(request));
    return retryMedia(database(), actor, z.uuid().parse(p.shopId), z.uuid().parse(p.id), v.version);
  });
}
