import { AccountWorkspaceShell } from "@/components/account-workspace-shell";
import { humanQueueState } from "@/modules/rent-presentation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { applicationQueue } from "@/server/applications";
import { ClaimApplicationButton } from "@/components/lifecycle-controls";
import { applicationReviewSummary } from "@/server/application-review-summary";
import { readReviewAlerts } from "@/server/operator-review-alerts";
import { OperatorReviewAlertControls } from "@/components/operator-review-alert-controls";
export const metadata = { title: "Application review queue" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string; status?: string; q?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const params = await searchParams;
  if (
    !Number.isInteger(Number(params.offset ?? 0)) ||
    Number(params.offset ?? 0) < 0 ||
    Number(params.offset ?? 0) > 10000 ||
    (params.q?.length ?? 0) > 80 ||
    (params.status &&
      ![
        "all",
        "actionable",
        "submitted",
        "reviewing",
        "needs_information",
        "approved",
        "rejected",
      ].includes(params.status))
  )
    notFound();
  const actor = await pageActor("/landlord"),
    offset = Number(params.offset ?? 0),
    rows = await applicationQueue(database(), actor, "review", offset, {
      status: params.status ?? "actionable",
      query: params.q ?? "",
    });
  const [summary, alerts] = await Promise.all([
    applicationReviewSummary(database(), actor),
    readReviewAlerts(database(), actor),
  ]);
  const pageHref = (page: number) =>
    `?${new URLSearchParams({ offset: String(page), status: params.status ?? "actionable", q: params.q ?? "" })}`;
  return (
    <AccountWorkspaceShell
      kind="landlord"
      title="Application review"
      subtitle="Review assigned work and follow up on requests."
      currentPath="/landlord/applications"
    >
      <section className="portal-section account-page">
        <h1>Application review queue</h1>
        <div className="review-queue-summary" aria-label="Application review report">
          <Link href="?status=submitted">
            <strong>{summary.submitted}</strong> ready for review
          </Link>
          <Link href="?status=reviewing">
            <strong>{summary.reviewing}</strong> in review
          </Link>
          <Link href="?status=needs_information">
            <strong>{summary.waiting}</strong> waiting for the applicant
          </Link>
        </div>
        {summary.oldest ? (
          <p>
            Oldest application waiting for review:{" "}
            {new Intl.DateTimeFormat("en-UG", {
              dateStyle: "medium",
              timeZone: "Africa/Kampala",
            }).format(summary.oldest)}
            .
          </p>
        ) : null}
        <form method="get" className="catalogue-filters">
          <div>
            <label htmlFor="review-query">Find a business</label>
            <input id="review-query" name="q" defaultValue={params.q} maxLength={80} />
          </div>
          <div>
            <label htmlFor="review-state">Application status</label>
            <select id="review-state" name="status" defaultValue={params.status ?? "actionable"}>
              <option value="actionable">Ready or in review</option>
              <option value="submitted">Ready for review</option>
              <option value="reviewing">In review</option>
              <option value="needs_information">Waiting for applicant</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">All submitted applications</option>
            </select>
          </div>
          <button className="button button--small">Find applications</button>
        </form>
        <p>
          Claim an application to obtain scoped access. Claiming and consequential changes require
          recent MFA. Duplicate-name signals are advisory and are never an automatic rejection.
        </p>
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
                <Link className="button button--small" href={`/landlord/applications/${a.id}`}>
                  Open record
                </Link>
              ) : (
                <ClaimApplicationButton id={a.id} permission="review" />
              )}
            </li>
          ))}
        </ul>
        {!rows.length ? <p>No applications on this page.</p> : null}
        <div className="button-row">
          {offset > 0 ? (
            <Link href={pageHref(Math.max(0, offset - 20))}>Previous applications</Link>
          ) : null}
          {rows.length === 20 ? <Link href={pageHref(offset + 20)}>Next applications</Link> : null}
          <Link href="/landlord">Management workspace</Link>
        </div>
        <OperatorReviewAlertControls initial={alerts} />
      </section>
    </AccountWorkspaceShell>
  );
}
