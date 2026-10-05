import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
import { readShopPilot } from "@/server/analytics";
export async function GET(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  return workspaceRequest(request, async (actor) =>
    readShopPilot(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      z.coerce.number().parse(new URL(request.url).searchParams.get("days") ?? 30),
    ),
  );
}
