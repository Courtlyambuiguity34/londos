import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { WorkspaceCommandPalette } from "@/components/workspace-command-palette";
import { PortalNavigation } from "./portal-navigation";

export type PortalLink = { href: string; label: string; description?: string };
export function PortalShell({
  kind,
  title,
  subtitle,
  links,
  children,
  currentPath,
  banner,
}: {
  kind: "shopkeeper" | "landlord";
  title: string;
  subtitle: string;
  links: PortalLink[];
  children: ReactNode;
  currentPath?: string;
  banner?: ReactNode;
}) {
  const homeHref = kind === "landlord" ? "/landlord" : "/shopkeeper";
  const safeLinks = links.filter((item) =>
    kind === "shopkeeper"
      ? !(item.href === "/landlord" || item.href.startsWith("/landlord/"))
      : !(item.href === "/shopkeeper" || item.href.startsWith("/shopkeeper/")),
  );
  return (
    <div className={`portal-shell portal-shell--${kind}`}>
      <aside
        className="portal-sidebar"
        aria-label={kind === "landlord" ? "Landlord navigation" : "Shopkeeper navigation"}
      >
        <Link href="/" className="portal-brand">
          <Image
            src="/brand/londos-logo.png"
            width={180}
            height={60}
            alt="Londos — Digital Mall"
            unoptimized
          />
        </Link>
        <div className="portal-sidebar-context">
          <span className="portal-context-icon" aria-hidden="true">
            {kind === "landlord" ? "▦" : "▣"}
          </span>
          <div>
            <strong>{kind === "landlord" ? "Mall management" : "Merchant workspace"}</strong>
            <small>{kind === "landlord" ? "Operator" : "Shopkeeper"}</small>
          </div>
        </div>
        <PortalNavigation
          kind={kind}
          homeHref={homeHref}
          links={safeLinks}
          currentPath={currentPath ?? homeHref}
        />
        <Link className="portal-back" href="/">
          ← Back to Londos mall
        </Link>
      </aside>
      <div className="portal-main">
        <header className="portal-topbar">
          <div className="portal-topbar-identity">
            <span className="portal-topbar-eyebrow">
              {kind === "landlord" ? "Londos administration" : "Londos for merchants"}
            </span>
            <strong>{kind === "landlord" ? "Management overview" : "Shopkeeper workspace"}</strong>
          </div>
          <div className="portal-topbar-controls">
            <WorkspaceCommandPalette items={[{ href: homeHref, label: "Home" }, ...safeLinks]} />
            <nav className="portal-topbar-actions" aria-label="Quick links">
              <Link href="/" className="portal-topbar-mall">
                Visit mall
              </Link>
              <Link
                href="/security"
                className="portal-topbar-account"
                aria-label="Account and security"
                title="Account and security"
              >
                Account <span aria-hidden="true">↗</span>
              </Link>
            </nav>
          </div>
        </header>
        {banner ? <div className="portal-banner">{banner}</div> : null}
        <div className="portal-content">
          <div className="portal-heading">
            <div>
              <p className="portal-kicker">Londos workspace</p>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
