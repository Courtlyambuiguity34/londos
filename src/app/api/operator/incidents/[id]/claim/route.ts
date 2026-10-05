import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { claimIncident, incidentClaimInput } from "@/server/incidents";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    claimIncident(
      database(),
      actor,
      z.uuid().parse((await params).id),
      incidentClaimInput.parse(await boundedBody(request)),
    ),
  );
}
