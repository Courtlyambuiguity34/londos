import type { Metadata } from "next";
import { WorkspaceGateway } from "@/components/workspace-gateway";
import Link from "next/link";
import { coreConfigured, coreConfig } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { listShops } from "@/server/workspace";
import { SignOutButton } from "@/components/auth-controls";

export const metadata: Metadata = { title: "Shopkeeper" };
export default async function ShopkeeperPage() {
  if (!coreConfigured()) return <WorkspaceGateway kind="shopkeeper" />;
  const actor = await pageActor("/shopkeeper"),
    shops = await listShops(database(), actor);
  return (
    <section className="shell page-section account-page merchant-portal">
      <p className="eyebrow">Londos merchant workspace</p>
      <h1>Welcome to your shops.</h1>
      <p>
        Manage your catalogue, contacts and shop design here. Only explicitly published eligible
        shops appear in the mall.
      </p>
      {coreConfig().localAdapters ? (
        <p>
          This development environment uses fictional businesses and does not collect live rent
          payments.
        </p>
      ) : null}
      <h2>Your shops <span className="merchant-count">({shops.length})</span></h2>\n      <ul className="workspace-list merchant-shop-grid">
        {shops.map((shop) => (
          <li key={shop.id}>
            <Link href={`/shopkeeper/shops/${shop.id}`}>{shop.name}</Link>
            <span>{shop.role}</span>
          </li>
        ))}
      </ul>
      {shops.length === 0 ? <div className="merchant-empty"><h3>No shops yet</h3><p>You have no shops linked to your account. Review your applications or accept a team invitation to get started.</p><Link className="button" href="/shopkeeper/applications">View applications</Link></div> : null}
      <h2>Account and team tools</h2>\n      <div className="account-links merchant-tools">
        <Link className="button" href="/shopkeeper/applications">
          Your applications
        </Link>
        <Link className="button" href="/security">
          Account security
        </Link>
        <Link className="button button--outline" href="/shopkeeper/team">
          Manage your teams
        </Link>
        <Link className="text-button" href="/shopkeeper/invitations">
          Accept an invitation
        </Link>
        <SignOutButton />
      </div>
    </section>
  );
}
