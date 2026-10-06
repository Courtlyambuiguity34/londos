import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { assistantRequest } from "@/modules/ai-design/contract";
import { assistantStatus, proposeDesign } from "@/server/ai-design/service";
type Context = { params: Promise<{ shopId: string }> };
export async function GET(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) =>
    assistantStatus(database(), actor, (await context.params).shopId),
  );
}
export async function POST(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) =>
    proposeDesign(
      database(),
      actor,
      (await context.params).shopId,
      assistantRequest.parse(await boundedBody(request)),
      { signal: request.signal },
    ),
  );
}
