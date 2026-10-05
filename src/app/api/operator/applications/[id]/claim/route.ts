import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { claimApplication } from "@/server/applications";
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) => {
    const v = z
      .object({ permission: z.enum(["review", "finance"]) })
      .strict()
      .parse(await boundedBody(request));
    return claimApplication(database(), actor, (await context.params).id, v.permission);
  });
}
