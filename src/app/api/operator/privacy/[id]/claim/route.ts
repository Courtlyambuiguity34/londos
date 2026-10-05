import { database } from "@/server/db/pool";
import { claimPrivacy } from "@/server/privacy";
import { privacyClaim } from "@/modules/privacy/contract";
import { boundedBody, workspaceRequest } from "@/server/http";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return workspaceRequest(request, async (actor) =>
    claimPrivacy(
      database(),
      actor,
      (await context.params).id,
      privacyClaim.parse(await boundedBody(request)),
    ),
  );
}
