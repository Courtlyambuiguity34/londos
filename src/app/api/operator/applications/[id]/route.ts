import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { readApplication } from "@/server/applications";
export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    readApplication(database(), actor, (await context.params).id, "review"),
  );
}
