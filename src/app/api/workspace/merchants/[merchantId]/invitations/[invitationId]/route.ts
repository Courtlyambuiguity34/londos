import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { revokeInvitation } from "@/server/security/memberships";
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ merchantId: string; invitationId: string }> },
) {
  return workspaceRequest(request, async (actor) => {
    const { merchantId, invitationId } = await params;
    await revokeInvitation(
      database(),
      actor,
      z.uuid().parse(merchantId),
      z.uuid().parse(invitationId),
    );
    return { status: "revoked" };
  });
}
