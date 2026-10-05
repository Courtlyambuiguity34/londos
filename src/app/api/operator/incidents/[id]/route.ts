import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { readOperatorIncident, commandIncident, incidentCommandInput } from "@/server/incidents";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    readOperatorIncident(database(), actor, z.uuid().parse((await params).id)),
  );
}
export async function POST(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    commandIncident(
      database(),
      actor,
      z.uuid().parse((await params).id),
      incidentCommandInput.parse(await boundedBody(request)),
    ),
  );
}
