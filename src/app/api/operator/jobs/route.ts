import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { requireOperator } from "@/server/security/authorization";
export async function GET(request: Request) {
  return workspaceRequest(request, async (actor) => {
    await requireOperator(database(), actor, "jobs");
    return (
      await database().query(
        "SELECT id,kind,state,attempts,max_attempts,last_error,available_at,created_at FROM jobs ORDER BY created_at DESC LIMIT 100",
      )
    ).rows;
  });
}
