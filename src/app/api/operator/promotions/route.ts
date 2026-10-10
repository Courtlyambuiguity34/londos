import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { createPromotion, promotionInput } from "@/server/communications";

export function POST(request: Request) {
  return workspaceRequest(request, async (actor) =>
    createPromotion(database(), actor, promotionInput.parse(await boundedBody(request))),
  );
}
