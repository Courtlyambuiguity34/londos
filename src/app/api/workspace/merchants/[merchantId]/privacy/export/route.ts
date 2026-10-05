import { database } from "@/server/db/pool";
import { exportPrivacy } from "@/server/privacy";
import { exportInput } from "@/modules/privacy/contract";
import { boundedBody, workspaceRequest } from "@/server/http";
export async function POST(request: Request, context: { params: Promise<{ merchantId: string }> }) {
  return workspaceRequest(request, async (actor) => {
    const input = exportInput.parse(await boundedBody(request));
    const value = await exportPrivacy(database(), actor, (await context.params).merchantId, input);
    return Response.json(value, {
      headers: { "Content-Disposition": `attachment; filename="londos-${input.section}.json"` },
    });
  });
}
