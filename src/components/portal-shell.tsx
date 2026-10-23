import Link from "next/link";
import type { ReactNode } from "react";

export type PortalLink = { href: string; label: string; description?: string };
export function PortalShell({ kind, title, subtitle, links, children }: {
  kind: "shopkeeper" | "landlord";
  title: string;
  subtitle: string;
  links: PortalLink[];
  children: ReactNode;
  currentPath?: string;
  banner?: ReactNode;
}) {
  const homeHref = kind === "landlord" ? "/landlord" : "/shopkeeper";
  const isHome = !currentPath || currentPath === homeHref;
  const safeLinks=links.filter(item=>kind==="shopkeeper" ? !(item.href==="/landlord"||item.href.startsWith("/landlord/")) : !(item.href==="/shopkeeper"||item.href.startsWith("/shopkeeper/")));
  return (
    <div className={`portal-shell portal-shell--${kind}`}>
      <aside className="portal-sidebar" aria-label={kind === "landlord" ? "Landlord navigation" : "Shopkeeper navigation"}>
        <Link href="/" className="portal-brand">◈ Londos</Link>
        <div className="portal-sidebar-context">
          <span className="portal-context-icon" aria-hidden="true">{kind === "landlord" ? "▦" : "▣"}</span>
          <div><strong>{kind === "landlord" ? "Mall management" : "Merchant workspace"}</strong><small>{kind === "landlord" ? "Operator" : "Shopkeeper"}</small></div>
        </div>
        <nav className="portal-nav" aria-label="Workspace tools">
          <Link className={isHome ? "portal-nav-link portal-nav-link--current" : "portal-nav-link"} href={homeHref} aria-current={isHome ? "page" : undefined}>Home</Link>
          {safeLinks.map((item) => { const active = Boolean(currentPath) && (currentPath === item.href || currentPath?.startsWith(`${item.href}/`)); return <Link className={active ? "portal-nav-link portal-nav-link--current" : "portal-nav-link"} aria-current={active ? "page" : undefined} href={item.href} key={item.href}>{item.label}</Link>; })}
        </nav>
        <Link className="portal-back" href="/">← Back to Londos mall</Link>
      </aside>
      <div className="portal-main">
        <header className="portal-topbar">
          <span>{kind === "landlord" ? "Landlord dashboard" : "Shopkeeper dashboard"}</span>
          <div className="portal-topbar-actions"><Link href="/">Mall</Link><Link href="/security">Account &amp; security</Link></div>
        </header>
        {banner ? <div className="portal-banner">{banner}</div> : null}
        <div className="portal-content">
          <div className="portal-heading"><div><p className="portal-kicker">Londos workspace</p><h1>{title}</h1><p>{subtitle}</p></div></div>
          {children}
        </div>
      </div>
    </div>
  );
}
