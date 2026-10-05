import { database } from "@/server/db/pool";
import { readPrivacy, commandPrivacy } from "@/server/privacy";
import { privacyCommand } from "@/modules/privacy/contract";
import { boundedBody, workspaceRequest } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) =>
    readPrivacy(database(), actor, (await context.params).id),
  );
}
export async function POST(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) =>
    commandPrivacy(
      database(),
      actor,
      (await context.params).id,
      privacyCommand.parse(await boundedBody(request)),
    ),
  );
}
