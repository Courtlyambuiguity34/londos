import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { claimTrustCase, trustClaimInput } from "@/server/trust";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    claimTrustCase(
      database(),
      actor,
      z.uuid().parse((await params).id),
      trustClaimInput.parse(await boundedBody(request)),
    ),
  );
}
