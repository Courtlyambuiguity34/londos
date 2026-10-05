import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import {
  readOwnerIncident,
  ownerIncidentCommand,
  ownerIncidentCommandInput,
} from "@/server/incidents";
type Context = { params: Promise<{ shopId: string; id: string }> };
export async function GET(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) => {
    const p = await params;
    return readOwnerIncident(database(), actor, z.uuid().parse(p.shopId), z.uuid().parse(p.id));
  });
}
export async function POST(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) => {
    const p = await params;
    return ownerIncidentCommand(
      database(),
      actor,
      z.uuid().parse(p.shopId),
      z.uuid().parse(p.id),
      ownerIncidentCommandInput.parse(await boundedBody(request)),
    );
  });
}
