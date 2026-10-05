import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { ownerIncidents, createIncident, incidentInput } from "@/server/incidents";
type Context = { params: Promise<{ shopId: string }> };
export async function GET(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    ownerIncidents(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      z.coerce
        .number()
        .int()
        .min(0)
        .max(500)
        .parse(new URL(request.url).searchParams.get("page") ?? 0),
    ),
  );
}
export async function POST(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    createIncident(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      incidentInput.parse(await boundedBody(request)),
    ),
  );
}
