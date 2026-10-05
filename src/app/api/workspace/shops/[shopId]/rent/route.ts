import { z } from "zod";
import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import { requestRenewal, shopRent } from "@/server/rent";
type Context = { params: Promise<{ shopId: string }> };
export function GET(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) =>
    shopRent(
      database(),
      actor,
      (await context.params).shopId,
      Number(new URL(request.url).searchParams.get("offset") ?? 0),
    ),
  );
}
export function POST(request: Request, context: Context) {
  return workspaceRequest(request, async (actor) => {
    const v = z
      .object({ version: z.number().int().positive() })
      .strict()
      .parse(await boundedBody(request));
    return requestRenewal(database(), actor, (await context.params).shopId, v.version);
  });
}
