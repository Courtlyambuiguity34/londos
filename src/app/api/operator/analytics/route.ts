import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { readOperatorPilot } from "@/server/analytics";
export async function GET(request: Request) {
  return workspaceRequest(request, (actor) =>
    readOperatorPilot(
      database(),
      actor,
      z.coerce.number().parse(new URL(request.url).searchParams.get("days") ?? 30),
    ),
  );
}
