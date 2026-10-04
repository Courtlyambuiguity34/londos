import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { changeMembership, membershipChange } from "@/server/security/memberships";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ merchantId: string; userId: string }> },
) {
  return workspaceRequest(request, async (actor) => {
    const { merchantId, userId } = await params;
    await changeMembership(
      database(),
      actor,
      z.uuid().parse(merchantId),
      z.string().min(1).max(128).parse(userId),
      membershipChange.parse(await boundedBody(request)),
    );
    return { status: "updated" };
  });
}
