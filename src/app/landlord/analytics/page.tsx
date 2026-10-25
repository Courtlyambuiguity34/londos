import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "@/server/db/pool";
import { coreConfigured, coreConfig } from "@/server/config";
import { requireOperator } from "@/server/security/authorization";
import { HostedToolNotice } from "@/components/hosted-tool-notice";
import { pageActor } from "@/server/page-actor";
import { readOperatorPilot } from "@/server/analytics";
import { PilotSummary } from "@/components/pilot-summary";
export const metadata = { title: "Pilot analytics" };
export default async function Page({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    days = Number((await searchParams).days ?? 30);
  if (!coreConfig().localAdapters) {
    await requireOperator(database(), actor, "analytics", true);
    return (
      <section className="shell page-section account-page">
        <h1>Platform analytics</h1>
        <HostedToolNotice
          title="Live analytics is not enabled"
          description="Live tracking and aggregate activity reporting remain disabled. No pilot statistics are presented as production visitor or sales results."
          backHref="/landlord"
          backLabel="Back to management"
        />
      </section>
    );
  }
  const result = await readOperatorPilot(database(), actor, [7, 30, 90].includes(days) ? days : 30);
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">MFA-protected development aggregates</p>
      <h1>Pilot analytics</h1>
      <nav className="filter-chips" aria-label="Analytics window">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`?days=${d}`} aria-current={d === days ? "page" : undefined}>
            {d} days
          </Link>
        ))}
      </nav>
      <PilotSummary {...result} />
      <h2>Application cohort and activation</h2>
      <p>
        {result.activation.applications} applications created in this window;{" "}
        {result.activation.provisioned} provisioned shops.
      </p>
      <p>
        Time to first committed publication:{" "}
        {result.firstPublish.median_seconds === null
          ? "No measured cohort yet"
          : `${Math.round(result.firstPublish.median_seconds / 60)} median minutes across ${result.firstPublish.measured} applications`}
        . Unpublished applications are excluded from this duration, not counted as zero.
      </p>
      <h2>Development renewals</h2>
      <p>
        {result.renewal.issued} renewal invoices issued in this window; {result.renewal.fully_paid}{" "}
        currently fully covered by net payment; {result.renewal.waiver_supported} settled with
        waiver support. Reversed credits are deducted. Live collection is disabled.
      </p>
      <h2>Current incident and trust backlogs</h2>
      {result.backlog.length ? (
        <ul>
          {result.backlog.map((r) => (
            <li key={`${r.workflow}:${r.kind}:${r.state}`}>
              {r.workflow} · {r.kind} · {r.state}: {r.count}; oldest{" "}
              {Math.floor(Number(r.oldest_seconds) / 3600)} hours
            </li>
          ))}
        </ul>
      ) : (
        <p>No current unresolved cases.</p>
      )}
      <p>
        Backlogs are current totals across creation dates. These summaries expose no private report,
        evidence, contact, account or ledger record. Response counts/durations do not measure staff
        working time. Per-shop resource cost attribution and governed export/deletion remain later
        P9 work.
      </p>
      <Link href="/landlord">Operator workspace</Link>
    </section>
  );
}
