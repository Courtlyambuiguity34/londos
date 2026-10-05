import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { readOperations, commandOperations, operationsInput } from "@/server/administration";
type Context = { params: Promise<{ shopId: string }> };
export function GET(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    readOperations(database(), actor, z.uuid().parse((await params).shopId)),
  );
}
export function POST(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    commandOperations(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      operationsInput.parse(await boundedBody(request)),
    ),
  );
}
