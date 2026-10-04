import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { grantStaffShop, staffShopInput } from "@/server/security/memberships";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ merchantId: string }> },
) {
  return workspaceRequest(request, async (actor) => {
    await grantStaffShop(
      database(),
      actor,
      z.uuid().parse((await params).merchantId),
      staffShopInput.parse(await boundedBody(request)),
    );
    return { status: "updated" };
  });
}
