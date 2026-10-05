import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { readTeam, teamCommand, teamCommandInput } from "@/server/team";
type Context = { params: Promise<{ merchantId: string }> };
export function GET(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    readTeam(
      database(),
      actor,
      z.uuid().parse((await params).merchantId),
      z.coerce
        .number()
        .int()
        .min(0)
        .max(500)
        .parse(new URL(request.url).searchParams.get("page") ?? 0),
    ),
  );
}
export function POST(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    teamCommand(
      database(),
      actor,
      z.uuid().parse((await params).merchantId),
      teamCommandInput.parse(await boundedBody(request)),
    ),
  );
}
