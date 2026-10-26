"use client";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { activePortalHref } from "@/modules/portal-navigation";
import { PortalIcon } from "./portal-icon";
import type { PortalLink } from "./portal-shell";

export function PortalNavigation({
  kind,
  homeHref,
  links,
  currentPath,
}: {
  kind: "shopkeeper" | "landlord";
  homeHref: string;
  links: PortalLink[];
  currentPath: string;
}) {
  const [open, setOpen] = useState(false),
    id = useId(),
    toggle = useRef<HTMLButtonElement>(null);
  const items: PortalLink[] = [
    { href: homeHref, label: kind === "shopkeeper" ? "Your shops" : "Dashboard" },
    ...links.filter((item) => item.href !== homeHref),
  ];
  const selected = activePortalHref(
    currentPath,
    items.map((item) => item.href),
  );
  const shortcuts = items.filter((item) => item.href !== "/security").slice(0, 3);
  return (
    <div
      className="portal-navigation"
      data-expanded={open}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <button
        className="portal-menu-toggle"
        ref={toggle}
        type="button"
        aria-controls={id}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {kind === "shopkeeper" ? "Shop menu" : "Management menu"}
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <nav
        id={id}
        className="portal-nav"
        aria-label={kind === "landlord" ? "Management sections" : "Merchant sections"}
      >
        {items.map((item, index) => (
          <div className="portal-nav-entry" key={item.href}>
            {item.group && item.group !== items[index - 1]?.group ? (
              <p className="portal-nav-group">{item.group}</p>
            ) : null}
            <Link
              className={`portal-nav-link${selected === item.href ? " portal-nav-link--current" : ""}`}
              href={item.href}
              key={item.href}
              aria-current={selected === item.href ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <PortalIcon href={item.href} />
              <span>{item.label}</span>
            </Link>
          </div>
        ))}
      </nav>
      <nav className="portal-mobile-dock" aria-label="Workspace shortcuts">
        {shortcuts.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={selected === item.href ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            <PortalIcon href={item.href} />
            <span>
              {item.href === homeHref
                ? "Home"
                : /catalogue/.test(item.href)
                  ? "Products"
                  : /applications/.test(item.href)
                    ? "Applications"
                    : item.label}
            </span>
          </Link>
        ))}
        <button
          type="button"
          aria-controls={id}
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            toggle.current?.scrollIntoView({ block: "start" });
            toggle.current?.focus();
          }}
        >
          <span className="portal-dock-more" aria-hidden="true">
            •••
          </span>
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
