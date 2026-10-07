import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pilotPlan, pilotDataset, planHash, costCategories } from "../src/modules/pilot/contract";
import { pilotDecision } from "../src/modules/pilot/report";
const [command, first, second, third] = process.argv.slice(2);
async function read(path: string) {
  const bytes = await readFile(path);
  if (bytes.length > 2 * 1024 * 1024) throw new Error("pilot_input_oversized");
  return JSON.parse(bytes.toString("utf8")) as unknown;
}
async function publish(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
try {
  if (command === "prepare" && first && !second) {
    const directory = resolve(first);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const now = new Date(),
      startsOn = new Date(now.getTime() + 86400000).toISOString().slice(0, 10),
      endsOn = new Date(now.getTime() + 46 * 86400000).toISOString().slice(0, 10);
    const plan = pilotPlan.parse({
      format: "londos-pilot-plan-v1",
      cohortId: randomUUID(),
      evidenceKind: "demonstration",
      registeredAt: now.toISOString(),
      registrationReference: null,
      approvedPolicyReference: null,
      window: { startsOn, endsOn },
      target: { minimum: 10, maximum: 20, minimumRenewalOpportunities: 10 },
      proposedRent: {
        currency: "UGX",
        amountMinor: "5000",
        periodDays: 30,
        graceDays: 7,
        approval: "development-only",
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
    await publish(resolve(directory, "plan.json"), plan);
    await publish(
      resolve(directory, "data.json"),
      pilotDataset.parse({
        format: "londos-pilot-data-v1",
        planSha256: planHash(plan),
        asOf: now.toISOString(),
        participants: [],
        ledger: [],
        costs: costCategories.map((category) => ({
          category,
          amountMinor: null,
          source: "unavailable",
          evidenceReference: null,
          allocationReference: null,
          complete: false,
        })),
        traffic: { scope: "cohort-shop-events", retainedFrom: null, counts: [] },
        incidents: [],
        bottlenecks: [],
        pricingRecommendation: null,
        productChangeRecommendation: null,
      }),
    );
    console.log(
      JSON.stringify({
        event: "pilot.prepared",
        directory,
        planSha256: planHash(plan),
        status: "proposal; register approved real plan before observations",
      }),
    );
  } else if (command === "report" && first && second && third) {
    const report = pilotDecision(
      pilotPlan.parse(await read(first)),
      pilotDataset.parse(await read(second)),
    );
    await publish(third, report);
    console.log(
      JSON.stringify({
        event: "pilot.reported",
        decision: report.decision,
        blockers: report.blockers,
        output: resolve(third),
      }),
    );
    if (report.decision === "insufficient-evidence") process.exitCode = 2;
  } else if (command === "hash" && first && !second)
    console.log(planHash(pilotPlan.parse(await read(first))));
  else throw new Error("pilot_usage");
} catch {
  console.error('{"event":"pilot.failed","code":"invalid_input_or_existing_output"}');
  process.exitCode = 1;
}
