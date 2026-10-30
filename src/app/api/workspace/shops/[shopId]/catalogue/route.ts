import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
type Context = { params: Promise<{ shopId: string }> };
import { readCatalogue } from "@/server/catalogue";
import { catalogueFilters } from "@/modules/catalogue-tools";
export async function GET(request: Request, { params }: Context) {
  const query = new URL(request.url).searchParams;
  return workspaceRequest(request, async (actor) =>
    readCatalogue(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      Number(new URL(request.url).searchParams.get("offset") ?? 0),
      catalogueFilters.parse({
        query: query.get("q") ?? "",
        departmentId: query.get("department") || null,
        availability: query.get("availability") ?? "all",
      }),
    ),
  );
}
