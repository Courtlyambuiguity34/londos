import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { readTrustEvidence } from "@/server/trust";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return workspaceRequest(
    request,
    async (actor) =>
      new Response(
        new Uint8Array(
          await readTrustEvidence(database(), actor, z.uuid().parse((await params).id)),
        ),
        {
          headers: {
            "Content-Type": "image/webp",
            "Content-Disposition": "inline; filename=report-evidence.webp",
          },
        },
      ),
  );
}
