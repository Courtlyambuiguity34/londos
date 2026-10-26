import { Icon } from "@/components/icon";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { WorkspaceCommandPalette } from "@/components/workspace-command-palette";
import { PortalNavigation } from "./portal-navigation";
import { PortalIcon } from "./portal-icon";
import { activePortalHref } from "@/modules/portal-navigation";

export type PortalLink = { href: string; label: string; description?: string; group?: string };
export function PortalShell({
  kind,
  title,
  subtitle,
  links,
  children,
  currentPath,
  banner,
  contextName,
  actions,
}: {
  kind: "shopkeeper" | "landlord";
  title: string;
  subtitle: string;
  links: PortalLink[];
  children: ReactNode;
  currentPath?: string;
  banner?: ReactNode;
  contextName?: string;
  actions?: ReactNode;
}) {
  const homeHref = kind === "landlord" ? "/landlord" : "/shopkeeper";
  const safeLinks = links.filter((item) =>
    kind === "shopkeeper"
      ? !(item.href === "/landlord" || item.href.startsWith("/landlord/"))
      : !(item.href === "/shopkeeper" || item.href.startsWith("/shopkeeper/")),
  );
  const destination = activePortalHref(
    currentPath ?? homeHref,
    safeLinks.map((link) => link.href),
  );
  const currentLabel = safeLinks.find((link) => link.href === destination)?.label;
  return (
    <div className={`portal-shell portal-shell--${kind}`}>
      <aside
        className="portal-sidebar"
        aria-label={kind === "landlord" ? "Landlord navigation" : "Shopkeeper navigation"}
      >
        <Link href="/" className="portal-brand">
          <Image
            src="/brand/londos-logo-dark.png"
            width={180}
            height={60}
            alt="Londos — Digital Mall"
            unoptimized
          />
        </Link>
        <div className="portal-sidebar-context">
          <span className="portal-context-icon" aria-hidden="true">
            <PortalIcon href={homeHref} />
          </span>
          <div>
            <strong>
              {contextName ?? (kind === "landlord" ? "Mall management" : "Merchant workspace")}
            </strong>
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
            <strong>
              {contextName ??
                (kind === "landlord" ? "Management overview" : "Shopkeeper workspace")}
            </strong>
          </div>
          <div className="portal-topbar-controls">
            <WorkspaceCommandPalette
              items={[
                { href: homeHref, label: "Home" },
                ...safeLinks.map((item) => ({ ...item, keywords: item.description ?? "" })),
              ]}
            />
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
                Account <Icon name="arrow" />
              </Link>
            </nav>
          </div>
        </header>
        <div className="portal-content">
          <nav className="workspace-breadcrumb" aria-label="Workspace location">
            <Link href={homeHref}>{kind === "landlord" ? "Management" : "Your business"}</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">
              {currentLabel ?? (currentPath === homeHref ? "Overview" : title)}
            </span>
          </nav>
          <div className="portal-heading">
            <div>
              <p className="portal-kicker">
                {kind === "landlord" ? "Your management desk" : "Your business on Londos"}
              </p>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            {actions ? <div className="workspace-heading-actions">{actions}</div> : null}
          </div>
          {banner ? <div className="portal-banner">{banner}</div> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
