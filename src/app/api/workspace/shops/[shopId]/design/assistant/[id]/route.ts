import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { assistantCommand } from "@/modules/ai-design/contract";
import { assistantDecision, readAssistantRequest } from "@/server/ai-design/service";
type Context = { params: Promise<{ shopId: string; id: string }> };
export async function GET(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) => {
    const { shopId, id } = await context.params;
    return readAssistantRequest(database(), actor, shopId, id);
  });
}
export async function POST(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) => {
    const { shopId, id } = await context.params;
    return assistantDecision(
      database(),
      actor,
      shopId,
      id,
      assistantCommand.parse(await boundedBody(request)),
    );
  });
}
