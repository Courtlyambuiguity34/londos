import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBytes } from "@/server/http";
import { evidenceAuthority, saveEvidence, readEvidence } from "@/server/applications";
type Context = { params: Promise<{ id: string; slot: string }> };
export function GET(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) => {
    const p = await context.params;
    const bytes = await readEvidence(database(), actor, p.id, Number(p.slot), "owner");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": "inline; filename=verification.webp",
      },
    });
  });
}
export function PUT(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) => {
    const p = await context.params;
    await evidenceAuthority(database(), actor, p.id);
    return saveEvidence(
      database(),
      actor,
      p.id,
      Number(p.slot),
      Number(request.headers.get("x-record-version")),
      await boundedBytes(request, 2097152),
      request.headers.get("content-type") ?? "",
    );
  });
}
