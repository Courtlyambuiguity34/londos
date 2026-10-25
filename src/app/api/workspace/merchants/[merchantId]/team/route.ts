import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { readTeam, teamCommand, teamCommandInput, teamPageInput } from "@/server/team";
type Context = { params: Promise<{ merchantId: string }> };
export function GET(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) => {
    const search = new URL(request.url).searchParams;
    const pages = teamPageInput.parse(
      Object.fromEntries(
        ["page", "membersPage", "invitationsPage", "shopsPage"].flatMap((key) =>
          search.has(key) ? [[key, search.get(key)]] : [],
        ),
      ),
    );
    return readTeam(
      database(),
      actor,
      z.uuid().parse((await params).merchantId),
      pages.page,
      pages,
    );
  });
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
