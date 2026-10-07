import { createHash } from "node:crypto";
import { z } from "zod";
const day = z.iso.date(),
  time = z.iso.datetime(),
  count = z.number().int().min(0).max(1_000_000);
const money = z.string().regex(/^(0|[1-9][0-9]{0,14})$/);
const reference = z
  .string()
  .trim()
  .min(5)
  .max(240)
  .regex(/^[^\r\n]+$/);
export const tasks = [
  "application",
  "setup",
  "catalogue",
  "design",
  "contact",
  "publication",
  "sharing",
  "maintenance",
] as const;
export const costCategories = [
  "collection_fees",
  "support_verification",
  "moderation",
  "storage_bandwidth",
  "compute_search_media",
  "ai",
  "acquisition",
] as const;
export const pilotPlan = z
  .object({
    format: z.literal("londos-pilot-plan-v1"),
    cohortId: z.uuid(),
    evidenceKind: z.enum(["demonstration", "real"]),
    registeredAt: time,
    registrationReference: reference.nullable(),
    approvedPolicyReference: reference.nullable(),
    window: z.object({ startsOn: day, endsOn: day }).strict(),
    target: z
      .object({
        minimum: z.literal(10),
        maximum: z.literal(20),
        minimumRenewalOpportunities: z.number().int().min(10).max(20),
      })
      .strict(),
    proposedRent: z
      .object({
        currency: z.literal("UGX"),
        amountMinor: money,
        periodDays: z.number().int().min(1).max(366),
        graceDays: z.number().int().min(0).max(30),
        approval: z.enum(["development-only", "live-approved"]),
      })
      .strict(),
    thresholds: z
      .object({
        activationPercent: z.number().min(1).max(100),
        maintenancePercent: z.number().min(1).max(100),
        paidRenewalPercent: z.number().min(1).max(100),
        incrementalValuePercent: z.number().min(1).max(100),
        maximumMedianAssistanceMinutes: z.number().int().min(0).max(480),
        stopPaidRenewalPercent: z.number().min(0).max(100),
        maximumUnresolvedCriticalIncidents: z.literal(0),
      })
      .strict(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      p.window.startsOn >= p.window.endsOn ||
      Date.parse(p.registeredAt) > Date.parse(p.window.startsOn)
    )
      ctx.addIssue({
        code: "custom",
        message: "Register the plan before a nonempty observation window.",
      });
    if (p.thresholds.stopPaidRenewalPercent >= p.thresholds.paidRenewalPercent)
      ctx.addIssue({ code: "custom", message: "Stop threshold must be below the go threshold." });
    if (
      Date.parse(p.window.endsOn) - Date.parse(p.window.startsOn) <
      (p.proposedRent.periodDays + p.proposedRent.graceDays) * 86400000
    )
      ctx.addIssue({ code: "custom", message: "Include a complete rent period and grace window." });
  });
export type PilotPlan = z.infer<typeof pilotPlan>;
export const participant = z
  .object({
    code: z.string().regex(/^P[0-9]{2}$/),
    shopId: z.uuid().nullable(),
    recruitedOn: day,
    consentReference: reference.nullable(),
    evidenceKind: z.enum(["demonstration", "real"]),
    baseline: z
      .object({
        recordedOn: day,
        category: z.enum(["fashion", "electronics", "beauty", "food", "home", "services", "other"]),
        discoveryChannels: z
          .array(
            z.enum([
              "word-of-mouth",
              "whatsapp",
              "facebook",
              "tiktok",
              "instagram",
              "physical",
              "other",
            ]),
          )
          .min(1)
          .max(7),
        digitalPresence: z.enum(["none", "social-only", "website", "multiple"]),
        catalogueSize: count,
        contactMethods: z
          .array(z.enum(["call", "whatsapp", "enquiry", "website", "physical"]))
          .min(1)
          .max(5),
        pain: z.enum([
          "discovery",
          "catalogue",
          "trust",
          "contact",
          "maintenance",
          "cost",
          "other",
        ]),
        willingnessToPayMinor: money.nullable(),
        currentMonthlyDigitalSpendMinor: money.nullable(),
      })
      .strict(),
    observations: z
      .array(
        z
          .object({
            task: z.enum(tasks),
            observedOn: day,
            result: z.enum(["independent", "assisted", "operator-completed", "failed"]),
            assistanceMinutes: z.number().int().min(0).max(480),
            verificationMinutes: z.number().int().min(0).max(480),
            evidenceReference: reference,
          })
          .strict(),
      )
      .max(100),
    interview: z
      .object({
        recordedOn: day,
        incrementalValue: z.enum(["confirmed", "not-confirmed", "unknown"]),
        renewalIntent: z.enum(["yes", "no", "unknown"]),
        bottleneck: z.enum([
          "none",
          "onboarding",
          "relevance",
          "trust",
          "support",
          "allowances",
          "rent",
          "other",
        ]),
        evidenceReference: reference,
      })
      .strict()
      .nullable(),
  })
  .strict();
export const pilotDataset = z
  .object({
    format: z.literal("londos-pilot-data-v1"),
    planSha256: z.string().regex(/^[a-f0-9]{64}$/),
    asOf: time,
    participants: z.array(participant).max(20),
    ledger: z
      .array(
        z
          .object({
            id: z.uuid(),
            participant: z.string().regex(/^P[0-9]{2}$/),
            invoiceId: z.uuid(),
            kind: z.enum(["initial", "renewal"]),
            dueOn: day,
            periodEndsOn: day,
            amountMinor: money,
            netPaymentMinor: money,
            netWaiverMinor: money,
            currency: z.literal("UGX"),
            evidenceKind: z.enum(["demonstration", "real"]),
            reconciled: z.boolean(),
            evidenceReference: reference,
          })
          .strict(),
      )
      .max(1000),
    costs: z
      .array(
        z
          .object({
            category: z.enum(costCategories),
            amountMinor: money.nullable(),
            source: z.enum(["actual", "estimate", "unavailable"]),
            evidenceReference: reference.nullable(),
            allocationReference: reference.nullable(),
            complete: z.boolean(),
          })
          .strict(),
      )
      .length(costCategories.length),
    traffic: z
      .object({
        scope: z.literal("cohort-shop-events"),
        retainedFrom: day.nullable(),
        counts: z
          .array(
            z
              .object({
                event: z.enum([
                  "shop_result_clicked",
                  "shop_viewed",
                  "department_viewed",
                  "product_viewed",
                  "contact_action_clicked",
                  "direct_link_entry",
                  "merchant_publish",
                  "merchant_catalogue_update",
                ]),
                source: z.enum(["direct", "discovery", "unattributed", "canonical"]),
                count,
              })
              .strict(),
          )
          .max(32),
      })
      .strict(),
    incidents: z
      .array(
        z
          .object({
            id: z.uuid(),
            participant: z.string().regex(/^P[0-9]{2}$/),
            severity: z.enum(["critical", "other"]),
            resolved: z.boolean(),
            evidenceReference: reference,
          })
          .strict(),
      )
      .max(1000),
    bottlenecks: z
      .array(
        z.object({
          area: z.enum([
            "onboarding",
            "relevance",
            "trust",
            "support",
            "allowances",
            "rent",
            "queries",
            "queue",
            "capacity",
          ]),
          observation: reference,
          evidenceReference: reference,
          proposedChange: reference,
        }),
      )
      .max(20),
    pricingRecommendation: reference.nullable(),
    productChangeRecommendation: reference.nullable(),
  })
  .strict();
export type PilotDataset = z.infer<typeof pilotDataset>;
export function planHash(plan: PilotPlan) {
  return createHash("sha256")
    .update(JSON.stringify(pilotPlan.parse(plan)))
    .digest("hex");
}
export function validatePilot(planInput: unknown, dataInput: unknown) {
  const plan = pilotPlan.parse(planInput),
    data = pilotDataset.parse(dataInput);
  if (planHash(plan) !== data.planSha256) throw new Error("pilot_plan_changed");
  if (
    new Set(data.participants.map((p) => p.code)).size !== data.participants.length ||
    new Set(data.participants.flatMap((p) => (p.shopId ? [p.shopId] : []))).size !==
      data.participants.filter((p) => p.shopId).length
  )
    throw new Error("duplicate_participant");
  if (
    new Set(data.ledger.map((l) => l.id)).size !== data.ledger.length ||
    new Set(data.ledger.map((l) => l.invoiceId)).size !== data.ledger.length
  )
    throw new Error("duplicate_invoice");
  if (new Set(data.costs.map((c) => c.category)).size !== costCategories.length)
    throw new Error("cost_categories_incomplete");
  if (
    new Set(data.incidents.map((i) => i.id)).size !== data.incidents.length ||
    new Set(data.traffic.counts.map((r) => `${r.event}:${r.source}`)).size !==
      data.traffic.counts.length
  )
    throw new Error("duplicate_observation");
  const codes = new Set(data.participants.map((p) => p.code)),
    lastDay = data.asOf.slice(0, 10);
  for (const p of data.participants) {
    if (
      p.recruitedOn < plan.window.startsOn ||
      p.recruitedOn > lastDay ||
      p.recruitedOn > plan.window.endsOn ||
      p.baseline.recordedOn > p.recruitedOn
    )
      throw new Error("invalid_baseline_date");
    for (const o of p.observations) {
      if (
        o.observedOn < p.recruitedOn ||
        o.observedOn > lastDay ||
        o.observedOn > plan.window.endsOn ||
        (o.result === "independent" && o.assistanceMinutes > 0)
      )
        throw new Error("invalid_task_observation");
    }
    if (
      p.interview &&
      (p.interview.recordedOn < p.recruitedOn ||
        p.interview.recordedOn > lastDay ||
        p.interview.recordedOn > plan.window.endsOn)
    )
      throw new Error("invalid_interview_date");
  }
  for (const l of data.ledger)
    if (
      !codes.has(l.participant) ||
      l.dueOn < plan.window.startsOn ||
      l.dueOn > plan.window.endsOn ||
      l.dueOn >= l.periodEndsOn ||
      BigInt(l.netPaymentMinor) + BigInt(l.netWaiverMinor) > BigInt(l.amountMinor) ||
      BigInt(l.amountMinor) === 0n
    )
      throw new Error("invalid_ledger_observation");
  for (const i of data.incidents)
    if (!codes.has(i.participant)) throw new Error("unknown_incident_participant");
  if (data.traffic.retainedFrom && data.traffic.retainedFrom > lastDay)
    throw new Error("invalid_traffic_window");
  return { plan, data };
}
