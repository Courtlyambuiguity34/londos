import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { incidentQueue } from "@/server/incidents";
import { IncidentClaimForm } from "@/components/incident-controls";
export const metadata = { title: "Incident assignments and recovery" };
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    page = z.coerce
      .number()
      .int()
      .min(0)
      .max(500)
      .parse((await searchParams).page ?? 0),
    rows = await incidentQueue(database(), actor, page);
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Scoped operator triage</p>
      <h1>Incident assignments and recovery</h1>
      <p>
        Escalated incidents appear first, then priority and age. Your current permissions select the
        categories you can review. Accept an assignment with fresh MFA before opening private
        details. This is a fictional local queue.
      </p>
      <ul className="workspace-list">
        {rows.map((c) => (
          <li key={c.id}>
            <h2>{c.name}</h2>
            <p>
              {c.kind} · {c.state} · Priority {c.priority} ·{" "}
              {new Date(c.created_at).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })}
            </p>
            {c.claimed ? (
              <Link className="button" href={`/landlord/incidents/${c.id}`}>
                Open assigned incident
              </Link>
            ) : c.assigned ? (
              <p>Assigned to another reviewer.</p>
            ) : (
              <IncidentClaimForm id={c.id} version={c.version} />
            )}
          </li>
        ))}
      </ul>
      {!rows.length ? <p>No open incidents for your permissions.</p> : null}
      <div className="account-links">
        {page > 0 ? <Link href={`?page=${page - 1}`}>Previous incidents</Link> : null}
        {rows.length === 20 && page < 500 ? (
          <Link href={`?page=${page + 1}`}>Next incidents</Link>
        ) : null}
        <Link href="/landlord">Landlord</Link>
      </div>
    </section>
  );
}
