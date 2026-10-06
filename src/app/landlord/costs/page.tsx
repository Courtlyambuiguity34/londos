import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { readOperatorCosts } from "@/server/costs";
import { CostSummary } from "@/components/cost-summary";
import { CostClaim } from "@/components/cost-journal";
export const metadata = { title: "Platform resources and reported costs" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; after?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    q = await searchParams,
    requested = Number(q.days ?? 30),
    data = await readOperatorCosts(
      database(),
      actor,
      [7, 30, 90].includes(requested) ? requested : 30,
      q.after ?? null,
    );
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Explicit costs grant and fresh native MFA</p>
      <h1>Platform resources and reported costs</h1>
      <nav className="filter-chips" aria-label="Cost reporting window">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`?days=${d}`} aria-current={d === data.days ? "page" : undefined}>
            {d} days
          </Link>
        ))}
      </nav>
      <h2>Measured logical storage now</h2>
      <p>{data.limits.media}</p>
      <p>
        Managed media: {data.media.blobs} blobs · {data.media.bytes} bytes. Recorded quota storage:{" "}
        {data.quota.stored_bytes} bytes; reserved headroom: {data.quota.reserved_bytes} bytes.
      </p>
      <ul>
        {data.evidence.map((e) => (
          <li key={e.category}>
            {e.category} evidence: {e.blobs} private blobs · {e.bytes} logical bytes
          </li>
        ))}
      </ul>
      <p>
        Evidence totals are platform-only aggregates. Pre-shop applications are not allocated to an
        invented shop; this grant exposes no private evidence content or cases.
      </p>
      <h2>Current queue use by scope</h2>
      <p>{data.limits.jobs}</p>
      <ul>
        {data.jobs.map((j) => (
          <li key={`${j.scope}:${j.state}`}>
            {j.scope} · {j.state}: {j.count} jobs · current attempt-counter sum{" "}
            {j.attempt_counter_sum}
          </li>
        ))}
      </ul>
      <CostSummary {...data} />
      <h2>Shop reporting scope</h2>
      <p>
        At most 20 shops per UUID page. Active merchant members cannot claim their own merchant.
        Costs scopes grant no support, verification, financial, privacy or account decisions.
      </p>
      <ul className="team-list">
        {data.shops.map((s) => (
          <li key={s.id}>
            <h3>{s.name}</h3>
            {s.scoped ? (
              <Link href={`/landlord/costs/${s.id}`}>Open scoped cost journal</Link>
            ) : (
              <CostClaim shop={s} />
            )}
          </li>
        ))}
      </ul>
      {data.nextAfter ? (
        <Link
          className="button button--outline"
          href={`?days=${data.days}&after=${data.nextAfter}`}
        >
          Next shop page
        </Link>
      ) : null}
      <Link href="/landlord">Operator workspace</Link>
    </section>
  );
}
