import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { applicationQueue } from "@/server/applications";
export function GET(request: Request) {
  return workspaceRequest(request, (actor) => {
    const p = new URL(request.url).searchParams;
    return applicationQueue(
      database(),
      actor,
      z.enum(["review", "finance"]).parse(p.get("permission") ?? "review"),
      Number(p.get("offset") ?? 0),
    );
  });
}
