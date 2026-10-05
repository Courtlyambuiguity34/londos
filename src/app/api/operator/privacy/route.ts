import { database } from "@/server/db/pool";
import { privacyQueue } from "@/server/privacy";
import { workspaceRequest } from "@/server/http";
export async function GET(request: Request) {
  return workspaceRequest(request, (actor) => privacyQueue(database(), actor));
}
