import { z } from "zod";
export const launchRequirements = [
  "hosting-domain-tls",
  "brevo-delivery",
  "independent-backup",
  "key-recovery",
  "current-privacy-journal",
  "live-subject-rights-and-recovery",
  "approved-rent-privacy-rpo-rto",
  "oncall-alert-delivery-and-http-telemetry",
  "actual-provider-cost-coverage",
  "real-device-accessibility",
  "release-security-review",
  "owner-launch-authorization",
] as const;
export const launchManifest = z
  .object({
    format: z.literal("londos-launch-manifest-v1"),
    sourceCommit: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .nullable(),
    domain: z
      .string()
      .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/)
      .nullable(),
    emailProvider: z.literal("brevo"),
    requirements: z
      .array(
        z
          .object({
            id: z.enum(launchRequirements),
            status: z.enum(["pending", "verified"]),
            owner: z.string().trim().min(1).max(100).nullable(),
            evidenceFile: z
              .string()
              .regex(/^docs\/evidence\/[A-Za-z0-9_./-]+\.json$/)
              .refine((p) => !p.split("/").includes(".."))
              .nullable(),
            sha256: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .nullable(),
          })
          .strict(),
      )
      .length(launchRequirements.length),
  })
  .strict()
  .refine((m) => new Set(m.requirements.map((r) => r.id)).size === launchRequirements.length);
export type LaunchManifest = z.infer<typeof launchManifest>;
export const liveGateReceipt = z
  .object({
    format: z.literal("londos-live-gate-receipt-v1"),
    requirement: z.enum(launchRequirements),
    evidenceKind: z.literal("live"),
    result: z.literal("passed"),
    verifiedAt: z.iso.datetime(),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    reviewer: z.string().trim().min(1).max(100),
    summary: z.string().trim().min(10).max(2000),
  })
  .strict();
export function evaluateLaunch(
  manifest: LaunchManifest,
  observed: {
    sourceCommit: string;
    sourceDirty: boolean;
    remoteOrigin: boolean;
    brevoConfigured: boolean;
  },
  receipts: Record<string, { sha256: string; value: unknown }>,
  now = Date.now(),
) {
  const m = launchManifest.parse(manifest),
    blockers: string[] = [];
  if (!m.domain) blockers.push("production_domain_missing");
  if (m.sourceCommit !== observed.sourceCommit || observed.sourceDirty)
    blockers.push("release_source_not_pinned_and_clean");
  if (!observed.remoteOrigin) blockers.push("runtime_is_development_loopback");
  if (!observed.brevoConfigured) blockers.push("brevo_sender_or_secret_missing");
  const requirements = m.requirements.map((r) => {
    let verified = false;
    if (r.status === "verified" && r.owner && r.evidenceFile && r.sha256) {
      const item = receipts[r.evidenceFile],
        receipt = liveGateReceipt.safeParse(item?.value);
      verified =
        !!item &&
        item.sha256 === r.sha256 &&
        receipt.success &&
        receipt.data.requirement === r.id &&
        receipt.data.sourceCommit === observed.sourceCommit &&
        Date.parse(receipt.data.verifiedAt) <= now + 60000;
    }
    if (!verified) blockers.push(`requirement:${r.id}`);
    return { id: r.id, owner: r.owner, verified };
  });
  return {
    gate: "G5",
    status: blockers.length ? "blocked" : "review-ready",
    sourceCommit: observed.sourceCommit,
    blockers,
    requirements,
    productionDeployed: false,
    authorizationConsumed: false,
    limitation:
      "This verifies supplied review receipts and current configuration only. Human attestations do not independently test providers, legal rights, deliverability or backup durability; it never deploys or publishes.",
  };
}
