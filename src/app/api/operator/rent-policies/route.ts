import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { createPolicy, listPolicies, policyInput } from "@/server/rent";
export function GET(request: Request) {
  return workspaceRequest(request, (actor) => listPolicies(database(), actor));
}
export function POST(request: Request) {
  return workspaceRequest(request, async (actor) =>
    createPolicy(database(), actor, policyInput.parse(await boundedBody(request))),
  );
}
