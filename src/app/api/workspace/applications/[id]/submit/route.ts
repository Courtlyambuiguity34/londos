import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { submitApplication, submitApplicationInput } from "@/server/applications";
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    submitApplication(
      database(),
      actor,
      (await context.params).id,
      submitApplicationInput.parse(await boundedBody(request)),
    ),
  );
}
