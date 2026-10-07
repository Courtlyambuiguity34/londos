import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { retireDemoAccount, retireDemoInput } from "@/server/demo-accounts";
export function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  return workspaceRequest(request, async (actor) =>
    retireDemoAccount(
      database(),
      actor,
      (await context.params).userId,
      retireDemoInput.parse(await boundedBody(request)),
    ),
  );
}
