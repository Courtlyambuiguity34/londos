import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { transferOwnership } from "@/server/security/memberships";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ merchantId: string }> },
) {
  return workspaceRequest(request, async (actor) => {
    const input = z
      .object({ userId: z.string().min(1).max(128) })
      .strict()
      .parse(await boundedBody(request));
    await transferOwnership(
      database(),
      actor,
      z.uuid().parse((await params).merchantId),
      input.userId,
    );
    return { status: "transferred" };
  });
}
