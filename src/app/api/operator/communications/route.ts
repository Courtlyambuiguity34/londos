import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { campaignInput, createCampaign, listCommunications } from "@/server/communications";

export function GET(request: Request) {
  return workspaceRequest(request, (actor) => listCommunications(database(), actor));
}
export function POST(request: Request) {
  return workspaceRequest(request, async (actor) =>
    createCampaign(database(), actor, campaignInput.parse(await boundedBody(request))),
  );
}
