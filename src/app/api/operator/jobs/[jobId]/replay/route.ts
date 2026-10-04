import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { replay } from "@/server/jobs/queue";
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  return workspaceRequest(request, async (actor) => {
    await replay(database(), actor, z.uuid().parse((await params).jobId));
    return { status: "queued" };
  });
}
