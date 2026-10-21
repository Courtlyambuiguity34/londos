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
    <section className="shell page-section account-page">
      <p className="eyebrow">Your private workspace</p>
      <h1>Your shops.</h1>
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
      <ul className="workspace-list">
        {shops.map((shop) => (
          <li key={shop.id}>
            <Link href={`/shopkeeper/shops/${shop.id}`}>{shop.name}</Link>
            <span>{shop.role}</span>
          </li>
        ))}
      </ul>
      {shops.length === 0 ? <p>No shops are available to your current membership.</p> : null}
      <div className="account-links">
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
