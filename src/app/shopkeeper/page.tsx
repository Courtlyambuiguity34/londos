import type { Metadata } from "next";
import { WorkspaceGateway } from "@/components/workspace-gateway";
import Link from "next/link";
import { coreConfigured } from "@/server/config";
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
      <p className="eyebrow">Private development workspace</p>
      <h1>Your shops.</h1>
      <p>
        These are fictional PostgreSQL records. Public browsing still uses the labeled fixtures. X1
        enables identity, scoped access and ordinary profile edits; catalogue, rent and publication
        workflows follow the Astra review.
      </p>
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
        <Link className="button" href="/security">
          Account security
        </Link>
        <SignOutButton />
      </div>
    </section>
  );
}
