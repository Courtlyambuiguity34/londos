import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { invite, invitationInput } from "@/server/security/memberships";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ merchantId: string }> },
) {
  return workspaceRequest(request, async (actor) =>
    invite(
      database(),
      actor,
      z.uuid().parse((await params).merchantId),
      invitationInput.parse(await boundedBody(request)),
    ),
  );
}
