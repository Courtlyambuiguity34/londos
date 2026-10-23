import { AccountWorkspaceShell } from "@/components/account-workspace-shell";
import { humanQueueState, CLAIM_IS_NOT_PAYMENT } from "@/modules/rent-presentation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { applicationQueue } from "@/server/applications";
import { ClaimApplicationButton } from "@/components/lifecycle-controls";
export const metadata = { title: "Development rent queue" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    offset = Number((await searchParams).offset ?? 0),
    rows = await applicationQueue(database(), actor, "finance", offset);
  return (
    <AccountWorkspaceShell kind="landlord" title="Rent review" subtitle="Review assigned work and follow up on requests." currentPath="/landlord/rent"><section className="portal-section account-page">
      <h1>Development rent queue</h1>
      <p>
        Claim an application to obtain scoped access. Claiming and consequential changes require
        recent MFA. Duplicate-name signals are advisory and are never an automatic rejection.
      </p>
      <p className="portal-rent-disclaimer" role="note">{CLAIM_IS_NOT_PAYMENT}</p>
      <ul className="workspace-list">
        {rows.map((a) => (
          <li key={a.id}>
            <div>
              <strong>{a.business_name}</strong>
              <p>
                {humanQueueState(a.state)}
                {a.possible_duplicate ? " · Possible duplicate business name" : ""}
              </p>
            </div>
            {a.claimed && a.state !== "submitted" ? (
              <Link className="button button--small" href={`/landlord/rent/${a.id}`}>
                Open record
              </Link>
            ) : (
              <ClaimApplicationButton id={a.id} permission="finance" />
            )}
          </li>
        ))}
      </ul>
      {!rows.length ? <p>No applications on this page.</p> : null}
      <div className="button-row">
        {offset > 0 ? (
          <Link href={`?offset=${Math.max(0, offset - 20)}`}>Previous applications</Link>
        ) : null}
        {rows.length === 20 ? <Link href={`?offset=${offset + 20}`}>Next applications</Link> : null}
        <Link href="/landlord">Management workspace</Link>
      </div>
    </section></AccountWorkspaceShell>
  );
}
