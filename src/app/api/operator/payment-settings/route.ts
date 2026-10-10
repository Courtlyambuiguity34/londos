import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { paymentSettingsInput, updatePaymentSettings } from "@/server/communications";

export function PUT(request: Request) {
  return workspaceRequest(request, async (actor) =>
    updatePaymentSettings(
      database(),
      actor,
      paymentSettingsInput.parse(await boundedBody(request)),
    ),
  );
}
