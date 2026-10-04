import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { listShops } from "@/server/workspace";
export async function GET(request: Request) {
  return workspaceRequest(request, (actor) => listShops(database(), actor));
}
