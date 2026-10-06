import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { readCostJournal } from "@/server/costs";
import { CostJournal } from "@/components/cost-journal";
export const metadata = { title: "Scoped operating cost journal" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ days?: string; after?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    id = (await params).shopId,
    q = await searchParams,
    requested = Number(q.days ?? 30),
    data = await readCostJournal(
      database(),
      actor,
      id,
      [7, 30, 90].includes(requested) ? requested : 30,
      q.after ?? null,
    );
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Scoped native-MFA reporting</p>
      <h1>Reported work for {data.shop.name}</h1>
      <nav className="filter-chips" aria-label="Cost reporting window">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`?days=${d}`} aria-current={d === data.days ? "page" : undefined}>
            {d} days
          </Link>
        ))}
      </nav>
      <CostJournal initial={JSON.parse(JSON.stringify(data))} />
      <Link href="/landlord/costs">Resource reporting</Link>
    </section>
  );
}
