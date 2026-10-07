import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { readDemoAccounts } from "@/server/demo-accounts";
export function GET(request: Request) {
  return workspaceRequest(request, (actor) =>
    readDemoAccounts(database(), actor, new URL(request.url).searchParams.get("after")),
  );
}
