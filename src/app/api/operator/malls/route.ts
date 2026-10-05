import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { mallOccupancy } from "@/server/administration";
export function GET(request: Request) {
  return workspaceRequest(request, (actor) =>
    mallOccupancy(
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
