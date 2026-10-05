import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { reviewApplication, reviewApplicationInput } from "@/server/applications";
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    reviewApplication(
      database(),
      actor,
      (await context.params).id,
      reviewApplicationInput.parse(await boundedBody(request)),
    ),
  );
}
