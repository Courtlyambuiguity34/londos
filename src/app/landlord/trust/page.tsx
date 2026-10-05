import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { trustQueue } from "@/server/trust";
import { ClaimTrustForm } from "@/components/trust-controls";
export const metadata = { title: "Scoped trust queue" };
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    page = z.coerce
      .number()
      .int()
      .min(0)
      .max(500)
      .parse((await searchParams).page ?? 0),
    rows = await trustQueue(database(), actor, page);
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">MFA-protected trust review</p>
      <h1>Shop concerns and appeals</h1>
      <p>
        Pending appeals appear first, then operator-assigned priority and oldest cases. Claim a case
        with fresh MFA before reading its report. A report never suspends a shop automatically.
      </p>
      <ul className="workspace-list">
        {rows.map((c) => (
          <li key={c.id}>
            <h2>{c.name}</h2>
            <p>
              {c.category} · {c.state} · Priority {c.priority}
              {c.appeal_pending ? " · Appeal pending" : ""} ·{" "}
              {new Date(c.created_at).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })}
            </p>
            {c.claimed ? (
              <Link className="button" href={`/landlord/trust/${c.id}`}>
                Open scoped trust case
              </Link>
            ) : (
              <ClaimTrustForm id={c.id} />
            )}
          </li>
        ))}
      </ul>
      {!rows.length ? <p>No open concerns in this queue.</p> : null}
      <div className="account-links">
        {page > 0 ? <Link href={`?page=${page - 1}`}>Previous concerns</Link> : null}
        {rows.length === 20 && page < 500 ? (
          <Link href={`?page=${page + 1}`}>Next concerns</Link>
        ) : null}
        <Link href="/landlord">Landlord</Link>
      </div>
    </section>
  );
}
