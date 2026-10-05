import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { createApplication, createApplicationInput, listApplications } from "@/server/applications";
export function GET(request: Request) {
  return workspaceRequest(request, (actor) =>
    listApplications(
      database(),
      actor,
      Number(new URL(request.url).searchParams.get("offset") ?? 0),
    ),
  );
}
export function POST(request: Request) {
  return workspaceRequest(request, async (actor) =>
    createApplication(database(), actor, createApplicationInput.parse(await boundedBody(request))),
  );
}
