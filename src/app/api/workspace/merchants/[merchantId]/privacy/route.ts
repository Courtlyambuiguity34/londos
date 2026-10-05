import { database } from "@/server/db/pool";
import { privacyInventory, ownerPrivacyCommand } from "@/server/privacy";
import { privacyOwnerCommand } from "@/modules/privacy/contract";
import { boundedBody, workspaceRequest } from "@/server/http";
type Context = { params: Promise<{ merchantId: string }> };
export async function GET(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) =>
    privacyInventory(database(), actor, (await context.params).merchantId),
  );
}
export async function POST(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) =>
    ownerPrivacyCommand(
      database(),
      actor,
      (await context.params).merchantId,
      privacyOwnerCommand.parse(await boundedBody(request)),
    ),
  );
}
