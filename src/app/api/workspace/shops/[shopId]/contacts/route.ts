import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBody, workspaceRequest } from "@/server/http";
type Context = { params: Promise<{ shopId: string }> };
import { readContacts, saveContacts, contactInput } from "@/server/contacts";
export async function GET(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    readContacts(database(), actor, z.uuid().parse((await params).shopId)),
  );
}
export async function PUT(request: Request, { params }: Context) {
  return workspaceRequest(request, async (actor) =>
    saveContacts(
      database(),
      actor,
      z.uuid().parse((await params).shopId),
      contactInput.parse(await boundedBody(request)),
    ),
  );
}
