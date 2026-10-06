import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { readOwnerCosts } from "@/server/costs";
import { CostSummary } from "@/components/cost-summary";
export const metadata = { title: "Shop resources and reported costs" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    id = (await params).shopId,
    requested = Number((await searchParams).days ?? 30),
    data = await readOwnerCosts(
      database(),
      actor,
      id,
      [7, 30, 90].includes(requested) ? requested : 30,
    );
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Fresh owner resource summary</p>
      <h1>Resources for {data.shop.name}</h1>
      <nav className="filter-chips" aria-label="Cost reporting window">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`?days=${d}`} aria-current={d === data.days ? "page" : undefined}>
            {d} days
          </Link>
        ))}
      </nav>
      <CostSummary {...data} />
      <Link href={`/shopkeeper/shops/${id}`}>Shop workspace</Link>
    </section>
  );
}
