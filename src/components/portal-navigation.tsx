"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { activePortalHref } from "@/modules/portal-navigation";

export function PortalNavigation({
  kind,
  homeHref,
  links,
  currentPath,
}: {
  kind: "shopkeeper" | "landlord";
  homeHref: string;
  links: { href: string; label: string }[];
  currentPath: string;
}) {
  const [open, setOpen] = useState(false),
    id = useId();
  const items = [
    { href: homeHref, label: kind === "shopkeeper" ? "Your shops" : "Dashboard" },
    ...links.filter((item) => item.href !== homeHref),
  ];
  const selected = activePortalHref(
    currentPath,
    items.map((item) => item.href),
  );
  return (
    <div className="portal-navigation" data-expanded={open}>
      <button
        className="portal-menu-toggle"
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
        {items.map((item) => (
          <Link
            className={`portal-nav-link${selected === item.href ? " portal-nav-link--current" : ""}`}
            href={item.href}
            key={item.href}
            aria-current={selected === item.href ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
