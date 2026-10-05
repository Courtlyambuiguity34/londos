"use client";
import { useEffect, useRef, type ReactNode } from "react";
import type { PilotContext, CaptureInput } from "@/modules/analytics/contract";
const key = "londos-pilot-navigation-v1";
type Route = { shop: string; source: "direct" | "discovery" | "unattributed"; until: number };
type State = {
  routes: Route[];
  pending: { shop: string; until: number } | null;
  available?: boolean;
};
function state(): State {
  try {
    const raw = JSON.parse(sessionStorage.getItem(key) ?? "null");
    const now = Date.now(),
      uuid = /^[0-9a-f-]{36}$/i;
    return {
      available: true,
      routes: Array.isArray(raw?.routes)
        ? raw.routes
            .filter(
              (r: Route) =>
                uuid.test(r.shop) &&
                ["direct", "discovery", "unattributed"].includes(r.source) &&
                r.until > now &&
                r.until <= now + 1_800_000,
            )
            .slice(-10)
        : [],
      pending:
        raw?.pending &&
        uuid.test(raw.pending.shop) &&
        raw.pending.until > now &&
        raw.pending.until <= now + 120_000
          ? raw.pending
          : null,
    };
  } catch {
    return { routes: [], pending: null, available: false };
  }
}
function save(value: State) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ routes: value.routes, pending: value.pending }));
    return true;
  } catch {
    return false;
  }
}
export function PilotObserver({
  capture,
  children,
}: {
  capture: { context: PilotContext; token: string } | null;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      !capture ||
      navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
    )
      return;
    const c = capture.context;
    let source: Route["source"] = "unattributed",
      freshDirect = false;
    if (c.shopId) {
      const value = state(),
        existing = value.routes.find((r) => r.shop === c.shopId);
      if (!value.available) {
        source = "unattributed";
      } else if (value.pending?.shop === c.shopId) {
        source = "discovery";
        value.pending = null;
      } else if (existing) source = existing.source;
      else {
        try {
          source =
            !document.referrer || new URL(document.referrer).origin !== location.origin
              ? "direct"
              : "unattributed";
        } catch {
          source = "unattributed";
        }
        freshDirect = source === "direct";
      }
      const route = { shop: c.shopId, source, until: existing?.until ?? Date.now() + 1_800_000 };
      if (
        !save({
          routes: [...value.routes.filter((r) => r.shop !== c.shopId), route].slice(-10),
          pending: value.pending,
        })
      ) {
        source = "unattributed";
        freshDirect = false;
      }
    }
    function send(
      event: CaptureInput["event"],
      target: string | null = null,
      channel: CaptureInput["channel"] = null,
      entrySource = source,
    ) {
      const platform = ["mall_visit", "search_submitted", "search_results_viewed"].includes(event);
      const body: CaptureInput = {
        token: capture!.token,
        event,
        target,
        source: platform ? null : entrySource,
        channel,
      };
      // Navigation/contact never waits for this bounded, lossy capture request.
      try {
        void fetch("/api/guest/pilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive: true,
          signal: AbortSignal.timeout(1500),
        }).catch(() => {});
      } catch {
        /* Browsing stays available. */
      }
    }
    if (c.page === "mall") send("mall_visit");
    if (c.page === "search") send("search_results_viewed");
    if (["shop", "department", "product"].includes(c.page)) {
      send("shop_viewed");
      if (freshDirect) send("direct_link_entry");
      if (c.page === "department" && c.departmentId) send("department_viewed");
      if (c.page === "product" && c.productId) send("product_viewed");
    }
    const element = root.current;
    function click(event: MouseEvent) {
      const target =
        event.target instanceof Element
          ? event.target.closest("[data-pilot-shop],[data-pilot-contact]")
          : null;
      if (!target || !element?.contains(target)) return;
      const shop = target.getAttribute("data-pilot-shop");
      if (shop && c.shops.includes(shop)) {
        if (c.globalDiscovery) {
          const value = state();
          save({ ...value, pending: { shop, until: Date.now() + 120_000 } });
        }
        send(
          "shop_result_clicked",
          shop,
          null,
          c.globalDiscovery
            ? "discovery"
            : (state().routes.find((r) => r.shop === shop)?.source ?? "unattributed"),
        );
      }
      const channel = target.getAttribute("data-pilot-contact");
      if (channel && ["call", "whatsapp", "enquiry", "website"].includes(channel))
        send("contact_action_clicked", null, channel as CaptureInput["channel"]);
    }
    function submit(event: Event) {
      if (event.target instanceof HTMLFormElement && event.target.getAttribute("role") === "search")
        send("search_submitted");
    }
    element?.addEventListener("click", click);
    element?.addEventListener("submit", submit);
    return () => {
      element?.removeEventListener("click", click);
      element?.removeEventListener("submit", submit);
    };
  }, [capture]);
  if (!capture) return <>{children}</>;
  return (
    <div ref={root} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
