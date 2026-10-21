import Link from "next/link";
import { notFound } from "next/navigation";
import { coreConfigured, coreConfig } from "@/server/config";
import { ApplicationsUnavailable } from "@/components/applications-unavailable";
import { sessionState } from "@/server/security/authorization";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { listApplications } from "@/server/applications";
export const metadata = { title: "Your applications" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper");
  await sessionState(database(), actor);
  if (!coreConfig().localAdapters) return <ApplicationsUnavailable />;
  const offset = Number((await searchParams).offset ?? 0),
    rows = await listApplications(database(), actor, offset);
  return (
    <section className="shell page-section account-page">
      <h1>Your applications</h1>
      <p>
        Apply for another shop, respond to a reviewer, or open the first invoice after approval. Use
        fictional business details in this development environment.
      </p>
      <Link className="button" href="/shopkeeper/applications/new">
        Start an application
      </Link>
      <ul className="workspace-list">
        {rows.map((a) => (
          <li key={a.id}>
            <Link href={`/shopkeeper/applications/${a.id}`}>{a.business_name}</Link>
            <span>{a.state.replaceAll("_", " ")}</span>
          </li>
        ))}
      </ul>
      {!rows.length ? <p>No applications on this page.</p> : null}
      <div className="button-row">
        {offset > 0 ? (
          <Link href={`?offset=${Math.max(0, offset - 20)}`}>Previous applications</Link>
        ) : null}
        {rows.length === 20 ? <Link href={`?offset=${offset + 20}`}>Next applications</Link> : null}
        <Link href="/shopkeeper">Your shops</Link>
      </div>
    </section>
  );
}
