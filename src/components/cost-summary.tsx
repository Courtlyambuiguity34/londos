import type { ReportedTotals, ResourceSnapshot, AIUsageTotals } from "@/server/costs";
export function CostSummary({
  days,
  resource,
  reported,
  limits,
  unavailable,
  aiUsage = [],
}: {
  days: number;
  resource?: ResourceSnapshot;
  reported: ReportedTotals;
  limits: { media: string; jobs: string; reported: string };
  unavailable: { source: string; reason: string }[];
  aiUsage?: AIUsageTotals;
}) {
  return (
    <>
      <p className="notice">
        Development resource reporting · Last {days} UTC calendar days including today. Current
        storage and queue snapshots do not measure money cost. Reported operating costs are not
        merchant charges.
      </p>
      {resource ? (
        <>
          <h2>Measured managed media now</h2>
          <p>{limits.media}</p>
          <p>
            Total logical blob bytes:{" "}
            {resource.blobs.reduce((n, b) => n + BigInt(b.bytes), 0n).toString()}.
          </p>
          {resource.blobs.length ? (
            <ul>
              {resource.blobs.map((b) => (
                <li key={b.variant}>
                  {b.variant}: {b.count} blobs · {b.bytes} bytes
                </li>
              ))}
            </ul>
          ) : (
            <p>No managed SQL media blobs currently stored for this shop.</p>
          )}
          {resource.quota ? (
            <p>
              Recorded quota storage: {resource.quota.stored_bytes} bytes. Reserved quota:{" "}
              {resource.quota.reserved_bytes} bytes of headroom.
            </p>
          ) : (
            <p>
              Quota metadata is not initialized for this shop; no recorded quota figure is
              available.
            </p>
          )}
          <ul>
            {resource.assets.map((a) => (
              <li key={a.state}>
                {a.state}: {a.count} managed assets
              </li>
            ))}
          </ul>
          <h2>Current shop-bound queue use</h2>
          <p>{limits.jobs}</p>
          {resource.jobs.length ? (
            <ul>
              {resource.jobs.map((j) => (
                <li key={j.state}>
                  {j.state}: {j.count} jobs · current attempt-counter sum {j.attempt_counter_sum}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              No current shop-bound queue rows. Shared jobs are reported separately at platform
              level.
            </p>
          )}
        </>
      ) : null}
      <h2>Operator-reported operating work</h2>
      <p>
        {limits.reported} Minutes and money are shown separately; no hourly rate has been assumed.
      </p>
      {reported.length ? (
        <ul className="team-list">
          {reported.map((r) => (
            <li key={r.category}>
              <strong>{r.category.replaceAll("_", " ")}</strong>
              <p>
                {r.net_minutes} net reported minutes · UGX {r.net_expense_minor} net reported
                expense minor units
              </p>
              <p>
                {r.recorded_entries} original entries · {r.corrections} corrections. Reporting
                completeness is unknown.
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          No operating work has been reported in this window. Actual time and expenses are
          unmeasured.
        </p>
      )}
      <h2>Provider-reported AI use</h2>
      <p>
        Reported tokens and configured USD estimates are separate from UGX operating work. Estimates
        are not reconciled bills or merchant charges; fixture attempts are labelled separately.
      </p>
      {aiUsage.length ? (
        <ul>
          {aiUsage.map((u) => (
            <li key={`${u.provider}-${u.verification}-${u.outcome}`}>
              {u.provider} · {u.verification} · {u.outcome}: {u.attempts} attempts,{" "}
              {u.reported_input_tokens} reported input tokens, {u.reported_output_tokens} reported
              output tokens, {u.unmeasured_attempts} attempts with missing usage,{" "}
              {u.estimated_cost_microusd ?? "unavailable"} estimated USD micro units.
            </li>
          ))}
        </ul>
      ) : (
        <p>No recorded AI attempts in this window. Actual provider costs are unmeasured.</p>
      )}
      <h2>Unavailable measurements</h2>
      <ul className="team-list">
        {unavailable.map((u) => (
          <li key={u.source}>
            <strong>{u.source}</strong>
            <p>{u.reason}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
