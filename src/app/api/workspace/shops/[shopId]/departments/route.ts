import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
type Context = { params: Promise<{ shopId: string }> };
import { saveDepartment, departmentInput } from "@/server/catalogue";
export async function POST(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    saveDepartment(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      null,
      departmentInput.parse(await boundedBody(request)),
    ),
  );
}
