import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { appealTrustCase, appealInput } from "@/server/trust";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ shopId: string; id: string }> },
) {
  return workspaceRequest(request, async (actor) => {
    const p = await params;
    return appealTrustCase(
      database(),
      actor,
      z.uuid().parse(p.shopId),
      z.uuid().parse(p.id),
      appealInput.parse(await boundedBody(request)),
    );
  });
}
