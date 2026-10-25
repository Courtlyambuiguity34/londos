import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { coreConfigured, coreConfig } from "./server/config";
import { database } from "./server/db/pool";
import { auth } from "./server/security/auth";
import {
  resolveActor,
  requireShop,
  requireStepUp,
  requireOperator,
  sessionState,
} from "./server/security/authorization";
import { applicationAccess } from "./server/lifecycle-common";
import { invoiceAccess } from "./server/rent";
import { operationsAccess } from "./server/administration";
import { trustAccess } from "./server/trust";
import { operatorCostAccess } from "./server/costs";
import { privacyOwnerAccess, privacyOperatorAccess } from "./server/privacy";
import { incidentAccess, incidentQueue } from "./server/incidents";
import { requireMerchant } from "./server/security/authorization";
import { AccessError } from "./server/security/errors";
import { acceptedRequestOrigin, corsResponse } from "./server/security/origin";

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
  // Preserve the pathname header previously supplied by middleware.ts.
  // Forward it to route handlers and server components on every matched request.
  const headers = new Headers(request.headers);
  headers.set("x-londos-pathname", request.nextUrl.pathname);
  const nextWithPathname = () => NextResponse.next({ request: { headers } });
  if (!coreConfigured()) return nextWithPathname();
  try {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      // Only CORS preflight is handled here. Actual API requests must reach
      // their route handlers, which enforce authentication and origin checks.
      if (request.method !== "OPTIONS") return nextWithPathname();
      if (!acceptedRequestOrigin(request)) return new NextResponse(null, { status: 403 });
      return corsResponse(request, new NextResponse(null, { status: 204 }));
    }
    // Public pages only need pathname propagation, not workspace authorization.
    if (
      !request.nextUrl.pathname.startsWith("/shopkeeper") &&
      !request.nextUrl.pathname.startsWith("/landlord") &&
      request.nextUrl.pathname !== "/security"
    )
      return nextWithPathname();
    const actor = await resolveActor(auth(), request.headers),
      path = request.nextUrl.pathname;
    const shop = /^\/shopkeeper\/shops\/([^/]+)(?:\/.*)?$/.exec(path);
    if (shop) {
      const parsed = z.uuid().safeParse(shop[1]);
      if (!parsed.success) return unavailable(404);
      const permission = /\/(address|trust|incidents|analytics|costs)(?:\/|$)/.test(path)
        ? "sensitive"
        : /\/rent(?:\/|$)/.test(path)
          ? "finance"
          : /\/(design|preview)(?:\/|$)/.test(path)
            ? "design"
            : "catalogue";
      const currentShop = await requireShop(database(), actor, parsed.data, permission);
      if (/\/design\/assistant(?:\/|$)/.test(path)) await requireStepUp(database(), actor);
      if (/\/(address|trust|incidents|analytics|costs)(?:\/|$)/.test(path))
        await requireMerchant(database(), actor, currentShop.merchant_id, "membership");
    }
    if (path === "/landlord" || path.startsWith("/landlord/")) {
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
      if (path.startsWith("/landlord/applications"))
        await requireOperator(database(), actor, "review");
      if (path.startsWith("/landlord/rent") || path.startsWith("/landlord/invoices"))
        await requireOperator(database(), actor, "finance");
    }
    if (path.startsWith("/landlord/operations"))
      await requireOperator(database(), actor, "operations");
    if (path.startsWith("/landlord/analytics"))
      await requireOperator(database(), actor, "analytics", true);
    if (path.startsWith("/landlord/trust")) await requireOperator(database(), actor, "moderation");
    if (path === "/landlord/incidents") await incidentQueue(database(), actor);
    const incident = /^\/landlord\/incidents\/([^/]+)$/.exec(path);
    if (incident) {
      const id = z.uuid().safeParse(incident[1]);
      if (!id.success) return unavailable(404);
      await incidentAccess(database(), actor, id.data);
    }
    const trust = /^\/landlord\/trust\/([^/]+)$/.exec(path);
    if (trust) {
      const id = z.uuid().safeParse(trust[1]);
      if (!id.success) return unavailable(404);
      await trustAccess(database(), actor, id.data);
    }
    if (path.startsWith("/landlord/rent-exceptions"))
      await requireOperator(database(), actor, "finance");
    const operation = /^\/landlord\/operations\/([^/]+)$/.exec(path);
    if (operation) {
      const id = z.uuid().safeParse(operation[1]);
      if (!id.success) return unavailable(404);
      await operationsAccess(database(), actor, id.data);
    }
    if (path.startsWith("/landlord/costs")) await requireOperator(database(), actor, "costs", true);
    const costShop = /^\/landlord\/costs\/([^/]+)$/.exec(path);
    if (costShop) {
      const id = z.uuid().safeParse(costShop[1]);
      if (!id.success) return unavailable(404);
      await operatorCostAccess(database(), actor, id.data);
    }
    if (path.startsWith("/landlord/privacy"))
      await requireOperator(database(), actor, "privacy", true);
    const privacyCase = /^\/landlord\/privacy\/([^/]+)$/.exec(path);
    if (privacyCase) {
      const id = z.uuid().safeParse(privacyCase[1]);
      if (!id.success) return unavailable(404);
      await privacyOperatorAccess(database(), actor, id.data);
    }
    const privacyOwner = /^\/shopkeeper\/merchants\/([^/]+)\/privacy$/.exec(path);
    if (privacyOwner) {
      const id = z.uuid().safeParse(privacyOwner[1]);
      if (!id.success) return unavailable(404);
      await privacyOwnerAccess(database(), actor, id.data);
    }
    const team = /^\/shopkeeper\/merchants\/([^/]+)\/team$/.exec(path);
    if (team) {
      const id = z.uuid().safeParse(team[1]);
      if (!id.success) return unavailable(404);
      await requireMerchant(database(), actor, id.data, "membership");
    }
    const application =
      /^\/(shopkeeper\/applications|landlord\/applications|landlord\/rent)\/([^/]+)$/.exec(path);
    if (
      application &&
      !(application[1] === "shopkeeper/applications" && application[2] === "new")
    ) {
      const id = z.uuid().safeParse(application[2]);
      if (!id.success) return unavailable(404);
      await applicationAccess(
        database(),
        actor,
        id.data,
        application[1] === "shopkeeper/applications"
          ? "owner"
          : application[1] === "landlord/applications"
            ? "review"
            : "finance",
      );
    }
    const invoice = /^\/(shopkeeper|landlord)\/invoices\/([^/]+)$/.exec(path);
    if (invoice) {
      const id = z.uuid().safeParse(invoice[2]);
      if (!id.success) return unavailable(404);
      await invoiceAccess(
        database(),
        actor,
        id.data,
        invoice[1] === "shopkeeper" ? "owner" : "finance",
      );
    }
    return nextWithPathname();
  } catch (error) {
    if (error instanceof AccessError) {
      // These landing pages recheck the shop/owner and freshness server-side,
      // rendering only recovery guidance when stale. Keep deeper proposal
      // previews and all mutation handlers fenced by their existing checks.
      if (
        error.code === "fresh_authentication_required" &&
        /^\/shopkeeper\/shops\/[a-f0-9-]{36}\/(?:design\/assistant|address)$/.test(
          request.nextUrl.pathname,
        )
      )
        return nextWithPathname();
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
export const config = {
  matcher: [
    {
      source: "/api/:path*",
      has: [{ type: "header", key: "access-control-request-method" }],
      // Next finalizes/clones middleware request bodies before calling routes.
      // Only bodyless preflights may enter here; otherwise a stalled upload
      // could prevent the route's bounded reader and deadline from starting.
      // Zero Content-Length is valid, including zeroes added by an HTTP client.
      missing: [
        { type: "header", key: "transfer-encoding" },
        { type: "header", key: "content-length", value: ".*[1-9].*" },
      ],
    },
    "/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|brand/|illustrations/|pwa/).*)",
    "/shopkeeper/:path*",
    "/landlord/:path*",
    "/security",
  ],
};
