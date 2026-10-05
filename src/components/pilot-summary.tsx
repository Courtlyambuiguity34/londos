import type { PilotRow } from "@/server/analytics";
const names: Record<string, string> = {
  mall_visit: "Mall visits",
  search_submitted: "Search submissions",
  search_results_viewed: "Search result pages",
  shop_result_clicked: "Shop result clicks",
  shop_viewed: "Shop page views",
  department_viewed: "Department views",
  product_viewed: "Product views",
  contact_action_clicked: "Contact intent",
  direct_link_entry: "Direct entries",
  merchant_publish: "Committed publications",
  merchant_catalogue_update: "Committed catalogue updates",
};
export function PilotSummary({
  observations,
  canonical,
  days,
  policy,
}: {
  observations: PilotRow[];
  canonical: PilotRow[];
  days: number;
  policy: { enabled: boolean; retentionDays: number; valid: boolean };
}) {
  return (
    <>
      <p className="notice">
        Development analytics · Last {days} UTC calendar days, including today. Capture{" "}
        {policy.enabled ? "enabled for fictional local browsing" : "disabled"}. Aggregate retention:{" "}
        {policy.retentionDays} days.
      </p>
      {!policy.valid ? (
        <p role="alert">Retention configuration is invalid; capture is disabled.</p>
      ) : null}
      <p>
        Counts measure page observations and contact intent, not unique people, confirmed orders or
        completed sales. Bots, internal accounts and privacy signals are filtered where practical.
        Capture can be incomplete during outages, blocked scripts or limits.
      </p>
      <h2>Public observations</h2>
      {observations.length ? (
        <ul className="team-list">
          {observations.map((row) => (
            <li key={`${row.event}:${row.source}:${row.detail}`}>
              <strong>
                {names[row.event] ?? row.event}: {row.count}
              </strong>
              <p>
                {row.source === "none" ? "Platform" : `Observed source: ${row.source}`}
                {row.detail !== "none"
                  ? ` · ${row.detail === "empty" ? "Zero results" : row.detail === "few" ? "1–5 results" : row.detail === "many" ? "6–20 results" : row.detail}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>No retained public observations in this window.</p>
      )}
      <h2>Canonical merchant activity</h2>
      <p>
        These counts come from committed audit history, including earlier activity in this window.
        They remain separate from browser observations and do not depend on capture being enabled.
      </p>
      {canonical.length ? (
        <ul>
          {canonical.map((row) => (
            <li key={row.event}>
              {names[row.event] ?? row.event}: {row.count}
            </li>
          ))}
        </ul>
      ) : (
        <p>No committed publication or catalogue activity in this window.</p>
      )}
      <p>
        Direct/discovery source is a bounded browser navigation observation. Blocked storage or
        unrecognized navigation is unattributed. No visitor cookie, IP, raw search query, referrer,
        credentials or private evidence is stored in these metrics.
      </p>
    </>
  );
}
