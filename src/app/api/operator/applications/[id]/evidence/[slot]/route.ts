import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { readEvidence } from "@/server/applications";
export function GET(request: Request, context: { params: Promise<{ id: string; slot: string }> }) {
  return workspaceRequest(request, async (actor) => {
    const p = await context.params;
    const bytes = await readEvidence(database(), actor, p.id, Number(p.slot), "review");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": "inline; filename=verification.webp",
      },
    });
  });
}
