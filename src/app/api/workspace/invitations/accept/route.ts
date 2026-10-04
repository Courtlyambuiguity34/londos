import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { acceptInvitation } from "@/server/security/memberships";
export async function POST(request: Request) {
  return workspaceRequest(request, async (actor) => {
    await acceptInvitation(
      database(),
      actor,
      z
        .object({ token: z.string().min(32).max(128) })
        .strict()
        .parse(await boundedBody(request)).token,
    );
    return { status: "accepted" };
  });
}
