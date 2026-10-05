import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { coreConfigured, coreConfig } from "./server/config";
import { database } from "./server/db/pool";
import { auth } from "./server/security/auth";
import { resolveActor, requireShop, sessionState } from "./server/security/authorization";
import { AccessError } from "./server/security/errors";

function unavailable(status: number) {
  // Authorize before the Flight/HTML renderer can start its response stream.
  // Constant HTML contains no identifiers, account data or request-derived text.
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workspace unavailable | Londos</title></head><body style="margin:0;background:#faf8f2;color:#292b24;font:18px/1.7 Arial,sans-serif"><main style="max-width:640px;padding:48px 24px;margin:auto"><h1>Workspace unavailable.</h1><p>This resource is not available to your current account. Return to your workspace or sign in again.</p><p><a href="/shopkeeper">Your shops</a> · <a href="/sign-in">Sign in</a></p></main></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Cookie",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
export async function proxy(request: NextRequest) {
  if (!coreConfigured()) return NextResponse.next();
  try {
    const actor = await resolveActor(auth(), request.headers),
      path = request.nextUrl.pathname;
    const shop = /^\/shopkeeper\/shops\/([^/]+)(?:\/.*)?$/.exec(path);
    if (shop) {
      const parsed = z.uuid().safeParse(shop[1]);
      if (!parsed.success) return unavailable(404);
      const permission = /\/(design|preview)(?:\/|$)/.test(path) ? "design" : "catalogue";
      await requireShop(database(), actor, parsed.data, permission);
    }
    if (path === "/landlord") {
      const state = await sessionState(database(), actor, true);
      if (
        !(
          await database().query("SELECT 1 FROM operator_grants WHERE user_id=$1 LIMIT 1", [
            actor.userId,
          ])
        ).rowCount
      )
        return unavailable(403);
      if (!state.mfa_enabled || !state.verified_at)
        return NextResponse.redirect(new URL("/security", coreConfig().baseURL));
    }
    return NextResponse.next();
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.status === 401) {
        const destination = request.nextUrl.pathname.startsWith("/landlord")
          ? "/landlord"
          : request.nextUrl.pathname === "/security"
            ? "/security"
            : "/shopkeeper";
        const target = new URL("/sign-in", coreConfig().baseURL);
        target.searchParams.set("next", destination);
        return NextResponse.redirect(target);
      }
      return unavailable(error.status);
    }
    return unavailable(503);
  }
}
export const config = { matcher: ["/shopkeeper/:path*", "/landlord/:path*", "/security"] };
