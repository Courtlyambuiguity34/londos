import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
import { changeAddress, addressInput } from "@/server/administration";
export function POST(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  return workspaceRequest(request, async (actor) =>
    changeAddress(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      addressInput.parse(await boundedBody(request)),
    ),
  );
}
