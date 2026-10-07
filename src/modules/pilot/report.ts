import { validatePilot, tasks, type PilotPlan, type PilotDataset } from "./contract";
const percent = (n: number, d: number) => (d ? Math.round((n / d) * 10000) / 100 : null);
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = values.toSorted((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
function wilson(n: number, d: number) {
  if (!d) return null;
  const p = n / d,
    z = 1.96,
    den = 1 + (z * z) / d,
    centre = (p + (z * z) / (2 * d)) / den,
    half = (z * Math.sqrt((p * (1 - p)) / d + (z * z) / (4 * d * d))) / den;
  return {
    lowerPercent: Math.round((centre - half) * 10000) / 100,
    upperPercent: Math.round((centre + half) * 10000) / 100,
    interpretation:
      "Descriptive interval for this small selected cohort; not a population or causal estimate.",
  };
}
export function pilotDecision(planInput: PilotPlan, dataInput: PilotDataset) {
  const { plan, data } = validatePilot(planInput, dataInput),
    cohort = data.participants,
    n = cohort.length;
  const funnel = tasks.map((task) => ({
    task,
    observed: cohort.filter((p) => p.observations.some((o) => o.task === task)).length,
    completed: cohort.filter((p) =>
      p.observations.some((o) => o.task === task && o.result !== "failed"),
    ).length,
    independent: cohort.filter((p) =>
      p.observations.some((o) => o.task === task && o.result === "independent"),
    ).length,
  }));
  const activated = cohort.filter((p) =>
    p.observations.some((o) => o.task === "publication" && o.result === "independent"),
  ).length;
  const maintained = cohort.filter((p) => {
    const published = p.observations
      .filter((o) => o.task === "publication" && o.result !== "failed")
      .map((o) => o.observedOn)
      .toSorted()[0];
    return (
      published &&
      p.observations.some(
        (o) =>
          o.task === "maintenance" &&
          o.result !== "failed" &&
          Date.parse(o.observedOn) - Date.parse(published) >= 7 * 86400000,
      )
    );
  }).length;
  const candidates = data.ledger.filter(
    (l) =>
      l.kind === "renewal" &&
      Date.parse(l.dueOn) + plan.proposedRent.graceDays * 86400000 <= Date.parse(data.asOf) &&
      l.evidenceKind === "real" &&
      l.reconciled,
  );
  // Evaluate the first completed opportunity for every merchant. A later
  // successful invoice must not hide an earlier failed renewal in this cohort.
  const first = new Map<string, (typeof candidates)[number]>();
  for (const invoice of candidates.toSorted(
    (a, b) => a.dueOn.localeCompare(b.dueOn) || a.invoiceId.localeCompare(b.invoiceId),
  ))
    if (!first.has(invoice.participant)) first.set(invoice.participant, invoice);
  const mature = [...first.values()];
  const eligible = new Set(mature.map((l) => l.participant));
  const paid = new Set(
    mature
      .filter((l) => BigInt(l.netPaymentMinor) >= BigInt(l.amountMinor))
      .map((l) => l.participant),
  );
  const waiverSupported = new Set(
    mature
      .filter(
        (l) =>
          BigInt(l.netPaymentMinor) < BigInt(l.amountMinor) &&
          BigInt(l.netPaymentMinor) + BigInt(l.netWaiverMinor) >= BigInt(l.amountMinor),
      )
      .map((l) => l.participant),
  );
  const confirmed = cohort.filter((p) => p.interview?.incrementalValue === "confirmed").length;
  const minutes = cohort.map((p) =>
      p.observations.reduce((v, o) => v + o.assistanceMinutes + o.verificationMinutes, 0),
    ),
    assistance = median(minutes);
  const revenue = data.ledger
    .filter((l) => l.evidenceKind === "real" && l.reconciled && l.dueOn <= data.asOf.slice(0, 10))
    .reduce((v, l) => v + BigInt(l.netPaymentMinor), 0n);
  const costsComplete = data.costs.every(
    (c) =>
      c.source === "actual" &&
      c.complete &&
      c.amountMinor !== null &&
      c.evidenceReference !== null &&
      c.allocationReference !== null,
  );
  const cost = data.costs.reduce(
    (v, c) => v + (c.source === "actual" && c.amountMinor !== null ? BigInt(c.amountMinor) : 0n),
    0n,
  );
  const acquisition = data.costs.find((c) => c.category === "acquisition")!;
  const contribution = costsComplete ? revenue - cost + BigInt(acquisition.amountMinor!) : null;
  const afterAcquisition = costsComplete ? revenue - cost : null;
  const critical = data.incidents.filter((i) => i.severity === "critical" && !i.resolved).length;
  const blockers: string[] = [];
  if (
    plan.evidenceKind !== "real" ||
    cohort.some((p) => p.evidenceKind !== "real") ||
    data.ledger.some((l) => l.evidenceKind !== "real")
  )
    blockers.push("demonstration_data_is_not_business_evidence");
  if (!plan.registrationReference) blockers.push("independent_pre_outcome_registration_missing");
  if (!plan.approvedPolicyReference || plan.proposedRent.approval !== "live-approved")
    blockers.push("live_operating_terms_unapproved");
  if (n < plan.target.minimum) blockers.push("real_cohort_incomplete");
  if (cohort.some((p) => !p.consentReference || !p.shopId))
    blockers.push("participant_consent_or_shop_missing");
  if (Date.parse(data.asOf) < Date.parse(plan.window.endsOn) + 86400000)
    blockers.push("observation_window_not_complete");
  if (eligible.size < plan.target.minimumRenewalOpportunities || eligible.size < n)
    blockers.push("complete_actual_renewal_opportunity_missing");
  if (
    cohort.some(
      (p) => !p.interview || tasks.some((task) => !p.observations.some((o) => o.task === task)),
    )
  )
    blockers.push("task_or_followup_coverage_incomplete");
  if (!costsComplete) blockers.push("actual_cost_coverage_incomplete");
  if (!data.traffic.retainedFrom || data.traffic.retainedFrom > plan.window.startsOn)
    blockers.push("traffic_window_incomplete");
  if (!data.productChangeRecommendation || !data.pricingRecommendation)
    blockers.push("decision_recommendations_missing");
  const activation = percent(activated, n),
    maintenance = percent(maintained, n),
    renewal = percent(paid.size, eligible.size),
    increment = percent(confirmed, n);
  const t = plan.thresholds;
  const criteria = {
    activation: activation !== null && activation >= t.activationPercent,
    maintenance: maintenance !== null && maintenance >= t.maintenancePercent,
    paidRenewal: renewal !== null && renewal >= t.paidRenewalPercent,
    incrementalValue: increment !== null && increment >= t.incrementalValuePercent,
    support: assistance !== null && assistance <= t.maximumMedianAssistanceMinutes,
    unitEconomics: contribution !== null && contribution >= 0n,
    trust: critical <= t.maximumUnresolvedCriticalIncidents,
  };
  const decision =
    critical > 0
      ? "stop"
      : blockers.length
        ? "insufficient-evidence"
        : renewal !== null && renewal <= t.stopPaidRenewalPercent
          ? "stop"
          : Object.values(criteria).every(Boolean)
            ? "go"
            : "revise";
  return {
    format: "londos-pilot-report-v1",
    cohortId: plan.cohortId,
    asOf: data.asOf,
    planSha256: data.planSha256,
    evidenceKind: plan.evidenceKind,
    decision,
    blockers,
    criteria,
    thresholds: t,
    cohort: {
      participants: n,
      categories: [...new Set(cohort.map((p) => p.baseline.category))].toSorted(),
    },
    funnel,
    retention: { maintained, denominator: n, percent: maintenance },
    renewal: {
      completedOpportunities: eligible.size,
      fullyPaid: paid.size,
      waiverSupported: waiverSupported.size,
      fullyPaidPercent: renewal,
      descriptiveInterval: wilson(paid.size, eligible.size),
      statedIntentYes: cohort.filter((p) => p.interview?.renewalIntent === "yes").length,
      definition:
        "First reconciled real renewal opportunity per merchant after due date plus grace, fully covered by net payments; later successes, waivers and intent never replace its outcome.",
    },
    economics: {
      currency: "UGX",
      reconciledNetPaymentMinor: revenue.toString(),
      costCoverageComplete: costsComplete,
      recordedActualCostMinor: cost.toString(),
      contributionBeforeAcquisitionMinor: contribution?.toString() ?? null,
      netAfterAcquisitionMinor: afterAcquisition?.toString() ?? null,
      costs: data.costs,
      scaleAcquisitionAllowed:
        decision === "go" && afterAcquisition !== null && afterAcquisition >= 0n,
    },
    support: {
      medianAssistanceAndVerificationMinutes: assistance,
      totalReportedMinutes: minutes.reduce((a, b) => a + b, 0),
      definition:
        "Explicit observed assistance plus verification; not queue age or independent staff measurement.",
    },
    discovery: {
      merchantReportedIncrementalValue: confirmed,
      denominator: n,
      percent: increment,
      observations: data.traffic,
      definition:
        "Aggregate observed routes and merchant interviews; no unique visitor, linked funnel, causal discovery or completed-sale claim.",
    },
    trust: { incidents: data.incidents.length, unresolvedCritical: critical },
    architectureBottlenecks: data.bottlenecks,
    productChangeRecommendation: data.productChangeRecommendation,
    pricingRecommendation: data.pricingRecommendation,
    limits: [
      "A selected 10–20 merchant cohort does not establish population demand or causation.",
      "Supplied records and evidence references require human review; local hashes do not prove independent preregistration, payments, consent or provider bills.",
      "Missing observations and cost sources remain unavailable, never zero or free.",
      "Improve a measured bottleneck; index and bounded-query work precedes new infrastructure.",
    ],
  };
}
