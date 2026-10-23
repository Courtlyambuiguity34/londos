import type { Metadata } from "next";
import Link from "next/link";
import { WorkspaceGateway } from "@/components/workspace-gateway";
import { PortalShell } from "@/components/portal-shell";
import { coreConfigured, coreConfig } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { listShops } from "@/server/workspace";
import { SignOutButton } from "@/components/auth-controls";

export const metadata: Metadata = { title: "Shopkeeper dashboard" };
export default async function ShopkeeperPage() {
  if (!coreConfigured()) return <WorkspaceGateway kind="shopkeeper" />;
  const actor = await pageActor("/shopkeeper");
  const shops = await listShops(database(), actor);
  const first = shops[0];
  const hostedApplicationsAvailable = true;
  const base = first ? `/shopkeeper/shops/${first.id}` : null;
  const links = [
    ...(base ? [
      { href: base, label: "My shop" },
      { href: `${base}/catalogue`, label: "Products & catalogue" },
      { href: `${base}/design`, label: "Shop design" },
      { href: `${base}/rent`, label: "Rent & subscription" },
      ...(first.role === "owner" ? [
        { href: `${base}/analytics`, label: "Analytics" },
        { href: `${base}/costs`, label: "Business costs" },
      ] : []),
    ] : []),
    { href: "/shopkeeper/applications", label: "Shop applications" },
    { href: "/shopkeeper/team", label: "Teams" },
    { href: "/shopkeeper/invitations", label: "Invitations" },
  ];
  return (
    <PortalShell kind="shopkeeper" title="Your business, all in one place." subtitle="Manage your shops, products, design and business tools." links={links}>
      {coreConfig().localAdapters ? <p className="portal-notice">Local development mode uses fictional businesses. Live rent collection is disabled.</p> : null}
      <div className="portal-stat-grid">
        <div className="portal-stat"><span>Accessible shops</span><strong>{shops.length}</strong><small>Shops linked to your membership</small></div>
        <div className="portal-stat"><span>Your role</span><strong className="portal-stat-text">{first?.role ?? "No shop"}</strong><small>Permissions vary by shop</small></div>
        <div className="portal-stat"><span>Workspace</span><strong className="portal-stat-text">{shops.length ? "Manage shops" : "No shop assigned"}</strong><small>{shops.length ? "Choose a shop to get started" : "Shop provisioning is required"}</small></div>
      </div>
      <section className="portal-section" aria-labelledby="shop-heading">
        <div className="portal-section-heading"><div><h2 id="shop-heading">Your shops</h2><p>Choose a shop to manage its products, branding and customer contacts.</p></div><Link className="portal-primary" href="/shopkeeper/applications">Application status →</Link></div>
        {shops.length ? <div className="portal-card-grid">{shops.map((shop) => (
          <article className="portal-shop-card" key={shop.id}>
            <div className="portal-shop-avatar" aria-hidden="true">{shop.name.slice(0, 1).toUpperCase()}</div>
            <span className="portal-pill">{shop.role}</span>
            <h3>{shop.name}</h3>
            <p>Update your storefront and manage shop activity.</p>
            <div className="portal-card-actions">
              <Link className="portal-primary" href={`/shopkeeper/shops/${shop.id}`}>Edit shop →</Link>
              <Link href={`/shopkeeper/shops/${shop.id}/catalogue`}>Products</Link>
              <Link href={`/shopkeeper/shops/${shop.id}/design`}>Design &amp; publish</Link>
              <Link href={`/shopkeeper/shops/${shop.id}/rent`}>Rent status</Link>
            </div>
          </article>
        ))}</div> : <div className="portal-empty"><h3>No shops linked yet</h3><p>Check your application status or accept an invitation to an existing merchant team.</p><Link className="portal-primary" href="/shopkeeper/invitations">View invitations →</Link></div>}
      </section>
      {hostedApplicationsAvailable ? <div className="portal-section"><Link className="portal-primary" href="/shopkeeper/applications/new">Apply for a new shop →</Link></div> : <p className="portal-notice"></p>}
      <section className="portal-section" aria-labelledby="tools-heading">
        <div className="portal-section-heading"><div><h2 id="tools-heading">Account & team tools</h2><p>Everything needed to manage access to your business.</p></div></div>
        <div className="portal-quick-grid">
          <Link href="/shopkeeper/team"><strong>Manage teams</strong><span>People and permissions →</span></Link>
          <Link href="/shopkeeper/invitations"><strong>Invitations</strong><span>Join a merchant workspace →</span></Link>
          <Link href="/security"><strong>Account security</strong><span>Protect your account →</span></Link>
        </div>
      </section>
      <div className="portal-signout"><SignOutButton /></div>
    </PortalShell>
  );
}
