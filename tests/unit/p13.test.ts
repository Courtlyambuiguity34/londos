import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  pilotPlan,
  pilotDataset,
  planHash,
  costCategories,
  tasks,
  validatePilot,
} from "../../src/modules/pilot/contract";
import { pilotDecision } from "../../src/modules/pilot/report";
import {
  launchRequirements,
  evaluateLaunch,
  type LaunchManifest,
} from "../../scripts/release/gate";
import { brevoMessage, emailLimits, notificationsConfigured } from "../../src/server/jobs/brevo";
import { registrationInput } from "../../src/server/registration";
function fixture() {
  const plan = pilotPlan.parse({
    format: "londos-pilot-plan-v1",
    cohortId: randomUUID(),
    evidenceKind: "real",
    registeredAt: "2026-01-01T00:00:00Z",
    registrationReference: "Independent registration record",
    approvedPolicyReference: "Approved hypothetical terms record",
    window: { startsOn: "2026-01-02", endsOn: "2026-02-20" },
    target: { minimum: 10, maximum: 20, minimumRenewalOpportunities: 10 },
    proposedRent: {
      currency: "UGX",
      amountMinor: "5000",
      periodDays: 30,
      graceDays: 7,
      approval: "live-approved",
    },
    thresholds: {
      activationPercent: 70,
      maintenancePercent: 60,
      paidRenewalPercent: 60,
      incrementalValuePercent: 50,
      maximumMedianAssistanceMinutes: 60,
      stopPaidRenewalPercent: 20,
      maximumUnresolvedCriticalIncidents: 0,
    },
  });
  const participants = Array.from({ length: 10 }, (_, i) => ({
    code: `P${String(i + 1).padStart(2, "0")}`,
    shopId: randomUUID(),
    recruitedOn: "2026-01-02",
    consentReference: "Hypothetical consent evidence",
    evidenceKind: "real",
    baseline: {
      recordedOn: "2026-01-02",
      category: "fashion",
      discoveryChannels: ["whatsapp"],
      digitalPresence: "social-only",
      catalogueSize: 20,
      contactMethods: ["whatsapp"],
      pain: "discovery",
      willingnessToPayMinor: "5000",
      currentMonthlyDigitalSpendMinor: null,
    },
    observations: tasks.map((task) => ({
      task,
      observedOn: task === "maintenance" ? "2026-01-15" : "2026-01-03",
      result: "independent",
      assistanceMinutes: 0,
      verificationMinutes: 0,
      evidenceReference: "Hypothetical task evidence",
    })),
    interview: {
      recordedOn: "2026-02-19",
      incrementalValue: "confirmed",
      renewalIntent: "yes",
      bottleneck: "none",
      evidenceReference: "Hypothetical interview evidence",
    },
  }));
  const data = pilotDataset.parse({
    format: "londos-pilot-data-v1",
    planSha256: planHash(plan),
    asOf: "2026-02-21T00:00:00Z",
    participants,
    ledger: participants.flatMap((p) =>
      ["initial", "renewal"].map((kind) => ({
        id: randomUUID(),
        participant: p.code,
        invoiceId: randomUUID(),
        kind,
        dueOn: kind === "initial" ? "2026-01-02" : "2026-02-01",
        periodEndsOn: kind === "initial" ? "2026-02-01" : "2026-03-03",
        amountMinor: "5000",
        netPaymentMinor: "5000",
        netWaiverMinor: "0",
        currency: "UGX",
        evidenceKind: "real",
        reconciled: true,
        evidenceReference: "Hypothetical reconciled credit",
      })),
    ),
    costs: costCategories.map((category) => ({
      category,
      amountMinor: "1000",
      source: "actual",
      evidenceReference: "Hypothetical bill record",
      allocationReference: "Hypothetical cohort allocation",
      complete: true,
    })),
    traffic: {
      scope: "cohort-shop-events",
      retainedFrom: "2026-01-02",
      counts: [
        { event: "shop_viewed", source: "direct", count: 500 },
        { event: "shop_viewed", source: "discovery", count: 50 },
      ],
    },
    incidents: [],
    bottlenecks: [],
    pricingRecommendation: "Retain current hypothetical price for another controlled cohort.",
    productChangeRecommendation:
      "Reduce independently observed onboarding friction before scaling.",
  });
  return { plan, data };
}
test("complete hypothetical records yield a cohort decision with exact net money, opportunities and uncertainty", () => {
  const { plan, data } = fixture(),
    r = pilotDecision(plan, data);
  expect(r.decision).toBe("go");
  expect(r.renewal.fullyPaid).toBe(10);
  expect(r.renewal.descriptiveInterval!.lowerPercent).toBeLessThan(100);
  expect(r.economics.reconciledNetPaymentMinor).toBe("100000");
  expect(r.economics.contributionBeforeAcquisitionMinor).toBe("94000");
  expect(r.economics.netAfterAcquisitionMinor).toBe("93000");
  expect(r.economics.scaleAcquisitionAllowed).toBe(true);
});
test("demonstrations never establish business validation even when the fictional outcomes are positive", () => {
  const { plan, data } = fixture();
  plan.evidenceKind = "demonstration";
  data.planSha256 = planHash(plan);
  const r = pilotDecision(plan, data);
  expect(r.decision).toBe("insufficient-evidence");
  expect(r.blockers).toContain("demonstration_data_is_not_business_evidence");
  expect(r.economics.scaleAcquisitionAllowed).toBe(false);
});
test.each(["waiver", "partial", "reversed"])(
  "%s and stated intent never count as fully paid renewal",
  (kind) => {
    const { plan, data } = fixture();
    for (const l of data.ledger.filter((l) => l.kind === "renewal")) {
      l.netPaymentMinor = kind === "partial" ? "2500" : "0";
      l.netWaiverMinor = kind === "waiver" ? "5000" : "0";
    }
    const r = pilotDecision(plan, data);
    expect(r.decision).toBe("stop");
    expect(r.renewal.fullyPaid).toBe(0);
    expect(r.renewal.statedIntentYes).toBe(10);
    expect(r.renewal.waiverSupported).toBe(kind === "waiver" ? 10 : 0);
  },
);
test("unknown or incomplete actual costs never become zero-cost or positive contribution claims", () => {
  const { plan, data } = fixture();
  data.costs[0]!.source = "unavailable";
  data.costs[0]!.amountMinor = null;
  const r = pilotDecision(plan, data);
  expect(r.decision).toBe("insufficient-evidence");
  expect(r.economics.contributionBeforeAcquisitionMinor).toBeNull();
  expect(r.economics.scaleAcquisitionAllowed).toBe(false);
});
test("a later paid renewal cannot hide the first failed opportunity", () => {
  const { plan, data } = fixture();
  for (const invoice of data.ledger.filter((l) => l.kind === "renewal")) {
    invoice.netPaymentMinor = "0";
    data.ledger.push({
      ...invoice,
      id: randomUUID(),
      invoiceId: randomUUID(),
      dueOn: "2026-02-12",
      netPaymentMinor: "5000",
    });
  }
  const result = pilotDecision(plan, data);
  expect(result.renewal.fullyPaid).toBe(0);
  expect(result.decision).toBe("stop");
});
test("independent task completion keeps separately measured operator verification time", () => {
  const { plan, data } = fixture();
  for (const p of data.participants) p.observations[0]!.verificationMinutes = 10;
  const result = pilotDecision(plan, data);
  expect(result.funnel[0]!.independent).toBe(10);
  expect(result.support.totalReportedMinutes).toBe(100);
});
test("negative contribution forces revision and blocks acquisition scaling", () => {
  const { plan, data } = fixture();
  data.costs[0]!.amountMinor = "200000";
  const r = pilotDecision(plan, data);
  expect(r.decision).toBe("revise");
  expect(r.economics.scaleAcquisitionAllowed).toBe(false);
});
test("acquisition spending is separated from contribution and can independently block scaling", () => {
  const { plan, data } = fixture();
  data.costs.find((c) => c.category === "acquisition")!.amountMinor = "200000";
  const r = pilotDecision(plan, data);
  expect(r.decision).toBe("go");
  expect(r.economics.contributionBeforeAcquisitionMinor).toBe("94000");
  expect(r.economics.scaleAcquisitionAllowed).toBe(false);
});
test("an unfinished observation period or immature renewal cannot pass", () => {
  const { plan, data } = fixture();
  data.asOf = "2026-02-20T00:00:00Z";
  expect(pilotDecision(plan, data).blockers).toContain("observation_window_not_complete");
  data.asOf = "2026-02-21T00:00:00Z";
  for (const l of data.ledger.filter((l) => l.kind === "renewal")) l.dueOn = "2026-02-20";
  expect(pilotDecision(plan, data).blockers).toContain(
    "complete_actual_renewal_opportunity_missing",
  );
});
test("critical unresolved trust incidents stop continuation, even with otherwise good results", () => {
  const { plan, data } = fixture();
  data.incidents.push({
    id: randomUUID(),
    participant: "P01",
    severity: "critical",
    resolved: false,
    evidenceReference: "Hypothetical trust incident",
  });
  expect(pilotDecision(plan, data).decision).toBe("stop");
});
test("changed thresholds cannot be silently applied to a frozen dataset", () => {
  const { plan, data } = fixture();
  plan.thresholds.paidRenewalPercent = 61;
  expect(() => pilotDecision(plan, data)).toThrow("pilot_plan_changed");
});
test.each(["participant", "shop", "invoice", "cost", "traffic", "incident"])(
  "duplicate %s cannot inflate results",
  (kind) => {
    const { plan, data } = fixture();
    if (kind === "participant") data.participants[1]!.code = data.participants[0]!.code;
    if (kind === "shop") data.participants[1]!.shopId = data.participants[0]!.shopId;
    if (kind === "invoice") data.ledger[1]!.invoiceId = data.ledger[0]!.invoiceId;
    if (kind === "cost") data.costs[1]!.category = data.costs[0]!.category;
    if (kind === "traffic") data.traffic.counts.push(data.traffic.counts[0]!);
    if (kind === "incident")
      data.incidents.push(
        ...Array.from({ length: 2 }, () => ({
          id: "a0000000-0000-4000-8000-000000000001",
          participant: "P01",
          severity: "other" as const,
          resolved: true,
          evidenceReference: "Hypothetical incident evidence",
        })),
      );
    expect(() => validatePilot(plan, data)).toThrow();
  },
);
test.each([
  "future-task",
  "late-baseline",
  "unknown-ledger-subject",
  "overcredit",
  "unknown-field",
  "wrong-currency",
])("invalid %s is rejected instead of normalized", (kind) => {
  const { plan, data } = fixture();
  if (kind === "future-task") data.participants[0]!.observations[0]!.observedOn = "2026-02-22";
  if (kind === "late-baseline") data.participants[0]!.baseline.recordedOn = "2026-01-03";
  if (kind === "unknown-ledger-subject") data.ledger[0]!.participant = "P99";
  if (kind === "overcredit") data.ledger[0]!.netPaymentMinor = "5001";
  if (kind === "unknown-field") Object.assign(data, { customerEmail: "private@example.org" });
  if (kind === "wrong-currency") Object.assign(data.ledger[0]!, { currency: "USD" });
  expect(() => validatePilot(plan, data)).toThrow();
});
test("repeated task records count distinct merchants and maintenance requires later use", () => {
  const { plan, data } = fixture();
  data.participants[0]!.observations.push(
    ...Array.from({ length: 10 }, () => data.participants[0]!.observations[0]!),
  );
  for (const p of data.participants)
    p.observations.find((o) => o.task === "maintenance")!.observedOn = "2026-01-03";
  const r = pilotDecision(plan, data);
  expect(r.funnel[0]!.observed).toBe(10);
  expect(r.retention.maintained).toBe(0);
  expect(r.decision).toBe("revise");
});
test("independent pre-outcome registration, participant consent and approved live terms remain required", () => {
  const { plan, data } = fixture();
  plan.registrationReference = null;
  plan.approvedPolicyReference = null;
  plan.proposedRent.approval = "development-only";
  data.planSha256 = planHash(plan);
  data.participants[0]!.consentReference = null;
  expect(pilotDecision(plan, data).blockers).toEqual(
    expect.arrayContaining([
      "independent_pre_outcome_registration_missing",
      "live_operating_terms_unapproved",
      "participant_consent_or_shop_missing",
    ]),
  );
});
test("Brevo action links are fixed-origin native-auth routes and messages contain no arbitrary HTML", () => {
  const origin = "https://mall.example.org";
  expect(
    brevoMessage(
      {
        template: "password-reset",
        to: "merchant@example.org",
        url: `${origin}/api/auth/reset-password/opaque?callbackURL=/sign-in`,
      },
      origin,
    ).text,
  ).toContain("Never share");
  for (const url of [
    "https://attacker.example/reset",
    `${origin}/shopkeeper`,
    `${origin}/api/auth/verify-email#fragment`,
  ])
    expect(() =>
      brevoMessage({ template: "email-verification", to: "merchant@example.org", url }, origin),
    ).toThrow();
  expect(() =>
    brevoMessage(
      {
        template: "rent-credit",
        to: "merchant@example.org",
        invoiceId: randomUUID(),
        eventId: randomUUID(),
        html: "<script>",
      },
      origin,
    ),
  ).toThrow();
});
test.each(["email-verification", "password-reset"] as const)(
  "%s emails use website branding and canonical assets without changing the secure action",
  (template) => {
    const origin = "https://custom.londos.example:8443";
    const url = `${origin}/api/auth/${template === "password-reset" ? "reset-password/opaque" : "verify-email"}?token=fixture-only&callbackURL=/sign-in`;
    const message = brevoMessage({ template, to: "owner@example.org", url }, origin);
    expect(message.html).toContain(`src="${origin}/brand/londos-logo.png"`);
    expect(message.html).toContain('alt="Londos — Digital Mall"');
    expect(message.html).toContain(`href="${origin}/privacy"`);
    expect(message.html).toContain(`href="${origin}/terms"`);
    expect(message.html).toContain(`href="${url.replaceAll("&", "&amp;")}"`);
    expect(message.text).toContain(url);
    expect(message.text).not.toContain("<table");
    const destinations = [...message.html.matchAll(/(?:href|src)="([^"]+)"/g)].map(
      ([, destination]) => new URL(destination!),
    );
    expect(destinations.every((destination) => destination.origin === origin)).toBe(true);
    expect(message.html).not.toMatch(/#4338ca|#f5f3ff|<script|<iframe|<form/i);
  },
);
test("Londos HTML campaigns escape operator content and monthly reports identify aggregate counts", () => {
  const origin = "https://mall.example.org";
  const campaign = brevoMessage(
    {
      template: "campaign",
      to: "merchant@example.org",
      campaignId: randomUUID(),
      subject: "A safe Londos update",
      body: "Read this update.\n\n<script>alert('unsafe')</script>",
      ctaLabel: "Open Londos",
      ctaPath: "/shopkeeper",
    },
    origin,
  );
  expect(campaign.html).toContain("Londos");
  expect(campaign.html).toContain("&lt;script&gt;");
  expect(campaign.html).not.toContain("<script>alert");
  expect(campaign.text).toContain("<script>alert");
  const report = brevoMessage(
    {
      template: "monthly-report",
      to: "merchant@example.org",
      shopId: randomUUID(),
      shopName: "Example shop",
      month: "2026-09",
      shopViews: "12",
      productViews: "8",
      contactActions: "3",
      discoveryClicks: "5",
    },
    origin,
  );
  expect(report.text).toContain("not unique people");
  expect(report.html).toContain("not unique visitors");
});
test("registration and email limits reject unsafe or ambiguous configuration", () => {
  expect(
    registrationInput.parse({
      name: "Shop Owner",
      email: "OWNER@EXAMPLE.ORG",
      password: "a-long-password-value",
      acceptTerms: true,
    }).email,
  ).toBe("owner@example.org");
  expect(() =>
    registrationInput.parse({
      name: "Shop Owner",
      email: "owner@example.org",
      password: "short",
      acceptTerms: true,
    }),
  ).toThrow();
  const previousHour = process.env.LONDOS_EMAIL_MAX_PER_HOUR,
    previousDay = process.env.LONDOS_EMAIL_MAX_PER_DAY;
  try {
    delete process.env.LONDOS_EMAIL_MAX_PER_HOUR;
    delete process.env.LONDOS_EMAIL_MAX_PER_DAY;
    expect(emailLimits()).toEqual({ hourly: 250, daily: 250 });
    process.env.LONDOS_EMAIL_MAX_PER_HOUR = "0";
    expect(() => emailLimits()).toThrow("londos_email_max_per_hour_invalid");
  } finally {
    if (previousHour === undefined) delete process.env.LONDOS_EMAIL_MAX_PER_HOUR;
    else process.env.LONDOS_EMAIL_MAX_PER_HOUR = previousHour;
    if (previousDay === undefined) delete process.env.LONDOS_EMAIL_MAX_PER_DAY;
    else process.env.LONDOS_EMAIL_MAX_PER_DAY = previousDay;
  }
});
test("remote authentication configuration fails closed without a selected email provider", () => {
  const before = process.env.LONDOS_EMAIL_PROVIDER;
  delete process.env.LONDOS_EMAIL_PROVIDER;
  try {
    expect(
      notificationsConfigured({
        deployMode: "render",
        localAdapters: false,
        databasePoolMax: 3,
        secureCookies: true,
        baseURL: "https://mall.example.org",
        allowedOrigins: ["https://mall.example.org"],
        databaseUrl: "postgresql://invalid",
        secret: "s".repeat(32),
      }),
    ).toBe(false);
  } finally {
    if (before === undefined) delete process.env.LONDOS_EMAIL_PROVIDER;
    else process.env.LONDOS_EMAIL_PROVIDER = before;
  }
});
test("G5 does not turn local reports, missing owners or fabricated green fields into launch approval", () => {
  const sourceCommit = "a".repeat(40),
    manifest: LaunchManifest = {
      format: "londos-launch-manifest-v1",
      sourceCommit,
      domain: "mall.example.org",
      emailProvider: "brevo",
      requirements: launchRequirements.map((id) => ({
        id,
        status: "verified",
        owner: "Responsible reviewer",
        evidenceFile: `docs/evidence/${id}.json`,
        sha256: "b".repeat(64),
      })),
    };
  const receipts: Record<string, { sha256: string; value: unknown }> = {};
  for (const r of manifest.requirements)
    receipts[r.evidenceFile!] = {
      sha256: r.sha256!,
      value: {
        format: "londos-live-gate-receipt-v1",
        requirement: r.id,
        evidenceKind: "live",
        result: "passed",
        verifiedAt: "2026-01-01T00:00:00Z",
        sourceCommit,
        reviewer: "Named accountable reviewer",
        summary: "Hypothetical human-reviewed live evidence receipt.",
      },
    };
  const observed = { sourceCommit, sourceDirty: false, remoteOrigin: true, brevoConfigured: true };
  expect(evaluateLaunch(manifest, observed, receipts).status).toBe("review-ready");
  expect(evaluateLaunch(manifest, observed, receipts).productionDeployed).toBe(false);
  receipts[manifest.requirements[0]!.evidenceFile!]!.value = {
    ...(receipts[manifest.requirements[0]!.evidenceFile!]!.value as object),
    evidenceKind: "staging",
  };
  expect(
    evaluateLaunch(manifest, { ...observed, remoteOrigin: false }, receipts).blockers,
  ).toContain("requirement:hosting-domain-tls");
  expect(evaluateLaunch(manifest, { ...observed, sourceDirty: true }, receipts).blockers).toContain(
    "release_source_not_pinned_and_clean",
  );
});
