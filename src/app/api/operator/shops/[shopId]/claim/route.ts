import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { claimOperations, claimOperationsInput } from "@/server/administration";
export function POST(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  return workspaceRequest(request, async (actor) =>
    claimOperations(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      claimOperationsInput.parse(await boundedBody(request)),
    ),
  );
}
