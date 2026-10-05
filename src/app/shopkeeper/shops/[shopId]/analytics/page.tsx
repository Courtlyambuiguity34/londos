import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { readShopPilot } from "@/server/analytics";
import { PilotSummary } from "@/components/pilot-summary";
export const metadata = { title: "Shop analytics" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    id = z.uuid().parse((await params).shopId),
    days = Number((await searchParams).days ?? 30);
  const result = await readShopPilot(database(), actor, id, [7, 30, 90].includes(days) ? days : 30);
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Private owner aggregates</p>
      <h1>Analytics for {result.shop.name}</h1>
      <nav className="filter-chips" aria-label="Analytics window">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`?days=${d}`} aria-current={d === days ? "page" : undefined}>
            {d} days
          </Link>
        ))}
      </nav>
      <PilotSummary {...result} />
      <Link href={`/shopkeeper/shops/${id}`}>Shop workspace</Link>
    </section>
  );
}
