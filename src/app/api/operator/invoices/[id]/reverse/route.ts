import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { reverseCredit, reverseInput } from "@/server/rent";
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    reverseCredit(
      database(),
      actor,
      (await context.params).id,
      reverseInput.parse(await boundedBody(request)),
    ),
  );
}
