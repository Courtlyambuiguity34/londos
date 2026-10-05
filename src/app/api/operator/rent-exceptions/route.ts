import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { rentExceptions } from "@/server/administration";
export function GET(request: Request) {
  return workspaceRequest(request, (actor) =>
    rentExceptions(
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
