import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { ownerIncidents } from "@/server/incidents";
import { CreateIncidentForm } from "@/components/incident-controls";
export const metadata = { title: "Shop incidents and recovery" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const id = z.uuid().safeParse((await params).shopId);
  if (!id.success) notFound();
  const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(500)
      .parse((await searchParams).page ?? 0),
    view = await ownerIncidents(database(), await pageActor("/shopkeeper"), id.data, page);
  return (
    <section className="shell page-section account-page">
      <h1>Shop incidents and recovery</h1>
      <p>
        Report a fictional security, recovery, fraud, rent, verification or support concern.
        Submission changes no account, money or visibility. A scoped reviewer must investigate;
        sensitive restoration needs your separate current confirmation.
      </p>
      <CreateIncidentForm shopId={id.data} contacts={view.contacts} />
      <h2>Own-shop incident requests</h2>
      <ul className="workspace-list">
        {view.cases.map((c) => (
          <li key={c.id}>
            <p>
              {c.kind} · {c.state} · {c.assigned ? "Reviewer assigned" : "Awaiting assignment"}
            </p>
            <Link href={`/shopkeeper/shops/${id.data}/incidents/${c.id}`}>
              Open incident request
            </Link>
          </li>
        ))}
      </ul>
      {!view.cases.length ? <p>No incidents for this shop.</p> : null}
      <div className="account-links">
        {page > 0 ? <Link href={`?page=${page - 1}`}>Previous incidents</Link> : null}
        {view.cases.length === 20 && page < 500 ? (
          <Link href={`?page=${page + 1}`}>Next incidents</Link>
        ) : null}
        <Link href={`/shopkeeper/shops/${id.data}`}>Shop workspace</Link>
      </div>
    </section>
  );
}
