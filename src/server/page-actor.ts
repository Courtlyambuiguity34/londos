import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./security/auth";
import { resolveActor } from "./security/authorization";
import { AccessError } from "./security/errors";
export async function pageActor(destination: "/shopkeeper" | "/landlord" | "/security") {
  try {
    return await resolveActor(auth(), await headers());
  } catch (error) {
    if (error instanceof AccessError) redirect(`/sign-in?next=${encodeURIComponent(destination)}`);
    throw error;
  }
}
