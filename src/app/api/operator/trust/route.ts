import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { trustQueue } from "@/server/trust";
export async function GET(request: Request) {
  return workspaceRequest(request, (actor) =>
    trustQueue(
      database(),
      actor,
      z.coerce
        .number()
        .int()
        .min(0)
        .max(500)
        .parse(new URL(request.url).searchParams.get("page") ?? 0),
    ),
  );
}
