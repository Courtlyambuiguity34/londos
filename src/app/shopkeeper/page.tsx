import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { WorkspaceGateway } from "@/components/workspace-gateway";
import { PortalShell } from "@/components/portal-shell";
import { ShopPublicLink } from "@/components/shop-public-link";
import { coreConfigured, coreConfig } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { listShops } from "@/server/workspace";
import { SignOutButton } from "@/components/auth-controls";
export const metadata: Metadata = { title: "Shopkeeper dashboard" };
export default async function ShopkeeperPage() {
  if (!coreConfigured()) return <WorkspaceGateway kind="shopkeeper" />;
  const actor = await pageActor("/shopkeeper");
  const [operatorAccess, merchantAccess] = await Promise.all([
    database().query("SELECT 1 FROM operator_grants WHERE user_id=$1 LIMIT 1", [actor.userId]),
    database().query("SELECT 1 FROM memberships WHERE user_id=$1 AND status='active' LIMIT 1", [
      actor.userId,
    ]),
  ]);
  if (operatorAccess.rowCount && !merchantAccess.rowCount) redirect("/landlord");
  const shops = await listShops(database(), actor);
  const links = [
    { href: "/shopkeeper/applications", label: "Applications", group: "Business account" },
    { href: "/shopkeeper/team", label: "Team & access" },
    { href: "/shopkeeper/invitations", label: "Invitations" },
  ];
  return (
    <PortalShell
      kind="shopkeeper"
      title="Your shops."
      subtitle="Everything for your business, in one place. Choose a shop to get started."
      links={links}
      currentPath="/shopkeeper"
    >
      {coreConfig().localAdapters ? (
        <p className="portal-notice">
          Local development mode uses fictional businesses. Live rent collection is disabled.
        </p>
      ) : null}
      <section className="portal-stat-grid" aria-label="Your shop summary">
        <div className="portal-stat">
          <span>Shops you manage</span>
          <strong>{shops.length}</strong>
          <small>Assigned to your account</small>
        </div>
        <div className="portal-stat">
          <span>Live storefronts</span>
          <strong>{shops.filter((shop) => shop.storefront.public).length}</strong>
          <small>Visible to customers on the mall</small>
        </div>
        <div className="portal-stat">
          <span>Setup or review</span>
          <strong>{shops.filter((shop) => !shop.storefront.public).length}</strong>
          <small>Check each shop’s next step below</small>
        </div>
      </section>
      <section className="portal-section" aria-labelledby="shop-heading">
        <div className="portal-section-heading">
          <div>
            <h2 id="shop-heading">Your storefronts</h2>
            <p>
              {shops.length
                ? "Each shop has its own workspace and public status."
                : "Approved and fully paid applications create a shop here. A submitted payment reference still needs verification."}
            </p>
          </div>
          <Link className="button button--outline" href="/shopkeeper/applications">
            View applications
          </Link>
        </div>
        {shops.length ? (
          <div className="portal-card-grid">
            {shops.map((shop) => (
              <article className="portal-shop-card" key={shop.id}>
                <div className="portal-shop-card__heading">
                  <span className="portal-shop-avatar" aria-hidden="true">
                    {shop.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="portal-pill">{shop.role}</span>
                </div>
                <h3>
                  {["catalogue", "design", "finance"].some((permission) =>
                    shop.permissions.includes(permission),
                  ) ? (
                    <Link
                      href={`/shopkeeper/shops/${shop.id}${shop.permissions.includes("catalogue") ? "" : shop.permissions.includes("design") ? "/design" : "/rent"}`}
                    >
                      {shop.name}
                    </Link>
                  ) : (
                    shop.name
                  )}
                </h3>
                <p>{shop.storefront.detail}</p>
                {["catalogue", "design", "finance"].some((permission) =>
                  shop.permissions.includes(permission),
                ) ? (
                  <Link
                    className="button"
                    href={`/shopkeeper/shops/${shop.id}${shop.permissions.includes("catalogue") ? "" : shop.permissions.includes("design") ? "/design" : "/rent"}`}
                  >
                    Manage shop →
                  </Link>
                ) : (
                  <p>
                    Ask the owner to assign catalogue, design or rent access for your workspace.
                  </p>
                )}
                <ShopPublicLink
                  slug={shop.slug}
                  shopId={shop.id}
                  storefront={shop.storefront}
                  canDesign={shop.permissions.includes("design")}
                  canManageRent={shop.permissions.includes("finance")}
                  absoluteBase={coreConfig().baseURL}
                  compact
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="portal-empty">
            <h3>Your first shop starts here</h3>
            <p>Apply for a shop space, or join a shop whose owner has invited you.</p>
            <div className="merchant-tools">
              <Link className="button" href="/shopkeeper/applications/new">
                Apply for a shop
              </Link>
              <Link href="/shopkeeper/invitations">View invitations</Link>
            </div>
          </div>
        )}
      </section>
      <section className="portal-section" aria-labelledby="account-heading">
        <div className="portal-section-heading">
          <div>
            <h2 id="account-heading">Your business account</h2>
            <p>
              Applications and access belong here. Products and shop settings are inside each shop.
            </p>
          </div>
        </div>
        <div className="portal-quick-grid">
          <Link href="/shopkeeper/applications">
            <strong>Applications & payments</strong>
            <span>Track approval, invoices and shop allocation →</span>
          </Link>
          <Link href="/shopkeeper/team">
            <strong>Team & invitations</strong>
            <span>Manage people and permissions →</span>
          </Link>
          <Link href="/security">
            <strong>Account security</strong>
            <span>Password, verification and authenticator →</span>
          </Link>
        </div>
      </section>
      {shops.length ? (
        <p>
          <Link href="/shopkeeper/applications/new">Apply for another shop →</Link>
        </p>
      ) : null}
      <div className="portal-signout">
        <SignOutButton />
      </div>
    </PortalShell>
  );
}
