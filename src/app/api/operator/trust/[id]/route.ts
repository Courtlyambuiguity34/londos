import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { readTrustCase } from "@/server/trust";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    readTrustCase(database(), actor, z.uuid().parse((await params).id)),
  );
}
