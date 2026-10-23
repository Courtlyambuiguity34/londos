import Link from "next/link";
import type { ReactNode } from "react";

export type PortalLink = { href: string; label: string; description?: string };
export function PortalShell({ kind, title, subtitle, links, children }: {
  kind: "shopkeeper" | "landlord";
  title: string;
  subtitle: string;
  links: PortalLink[];
  children: ReactNode;
}) {
  return (
    <div className="portal-shell">
      <aside className="portal-sidebar" aria-label={kind === "landlord" ? "Landlord navigation" : "Shopkeeper navigation"}>
        <Link href="/" className="portal-brand">◈ Londos</Link>
        <div className="portal-sidebar-context">
          <span className="portal-context-icon" aria-hidden="true">{kind === "landlord" ? "▦" : "▣"}</span>
          <div><strong>{kind === "landlord" ? "Mall management" : "Merchant workspace"}</strong><small>{kind === "landlord" ? "Operator" : "Shopkeeper"}</small></div>
        </div>
        <nav className="portal-nav" aria-label="Workspace tools">
          <Link className="portal-nav-link portal-nav-link--current" href={kind === "landlord" ? "/landlord" : "/shopkeeper"} aria-current="page">▦ Dashboard</Link>
          {links.map((item) => <Link className="portal-nav-link" href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
        <Link className="portal-back" href="/">← Back to Londos mall</Link>
      </aside>
      <div className="portal-main">
        <header className="portal-topbar">
          <span>{kind === "landlord" ? "Landlord dashboard" : "Shopkeeper dashboard"}</span>
          <Link href="/security">Account & security ↗</Link>
        </header>
        <div className="portal-content">
          <div className="portal-heading"><div><p className="portal-kicker">Londos workspace</p><h1>{title}</h1><p>{subtitle}</p></div></div>
          {children}
        </div>
      </div>
    </div>
  );
}
