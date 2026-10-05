import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest } from "@/server/http";
type Context = { params: Promise<{ shopId: string }> };
import { listGuestRequests } from "@/server/contacts";
export async function GET(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    listGuestRequests(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      Number(new URL(request.url).searchParams.get("offset") ?? 0),
    ),
  );
}
