import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
type Context = { params: Promise<{ shopId: string; id: string; variant: string }> };
import { readVariant, displayVariant } from "@/server/media";
export async function GET(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) => {
    const p = await params,
      bytes = await readVariant(
        database(),
        actor,
        z.uuid().parse(p.shopId),
        z.uuid().parse(p.id),
        displayVariant.parse(p.variant),
      );
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/webp", "Content-Length": String(bytes.length) },
    });
  });
}
