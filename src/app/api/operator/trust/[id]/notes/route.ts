import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { noteTrustCase, trustNoteInput } from "@/server/trust";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    noteTrustCase(
      database(),
      actor,
      z.uuid().parse((await params).id),
      trustNoteInput.parse(await boundedBody(request)),
    ),
  );
}
