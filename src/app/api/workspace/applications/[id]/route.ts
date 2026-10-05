import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { readApplication, updateApplication, updateApplicationInput } from "@/server/applications";
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) =>
    readApplication(database(), actor, (await context.params).id),
  );
}
export function PATCH(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) =>
    updateApplication(
      database(),
      actor,
      (await context.params).id,
      updateApplicationInput.parse(await boundedBody(request)),
    ),
  );
}
