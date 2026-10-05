import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { ownedMerchants } from "@/server/team";
import { z } from "zod";
export function GET(request: Request) {
  return workspaceRequest(request, (actor) =>
    ownedMerchants(
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
