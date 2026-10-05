import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { decideTrustCase, trustDecisionInput } from "@/server/trust";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    decideTrustCase(
      database(),
      actor,
      z.uuid().parse((await params).id),
      trustDecisionInput.parse(await boundedBody(request)),
    ),
  );
}
