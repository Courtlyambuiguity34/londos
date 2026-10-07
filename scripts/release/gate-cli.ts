import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { loadLocalEnv } from "../local-env";
import { coreConfig } from "../../src/server/config";
import { notificationsConfigured } from "../../src/server/jobs/brevo";
import { launchManifest, evaluateLaunch } from "./gate";
import { observedSourcePin } from "./source-pin";
loadLocalEnv();
const [manifestFile, output] = process.argv.slice(2);
try {
  if (!manifestFile || !output) throw new Error("gate_usage");
  const bytes = await readFile(manifestFile);
  if (bytes.length > 262144) throw new Error("manifest_oversized");
  const manifest = launchManifest.parse(JSON.parse(bytes.toString("utf8"))),
    receipts: Record<string, { sha256: string; value: unknown }> = {};
  for (const requirement of manifest.requirements) {
    if (!requirement.evidenceFile) continue;
    try {
      const b = await readFile(resolve(requirement.evidenceFile));
      if (b.length > 262144) continue;
      receipts[requirement.evidenceFile] = {
        sha256: createHash("sha256").update(b).digest("hex"),
        value: JSON.parse(b.toString("utf8")),
      };
    } catch {
      /* Absent receipts remain open. */
    }
  }
  const { sourceCommit, sourceDirty } = observedSourcePin(manifest.sourceCommit);
  let remoteOrigin = false,
    brevoConfigured = false;
  try {
    const c = coreConfig();
    remoteOrigin =
      !c.localAdapters &&
      c.secureCookies &&
      !["localhost", "127.0.0.1", "[::1]"].includes(new URL(c.baseURL).hostname);
    brevoConfigured =
      process.env.LONDOS_EMAIL_PROVIDER === "brevo" &&
      notificationsConfigured({ ...c, localAdapters: false });
  } catch {
    /* Missing config is a blocker. */
  }
  const result = {
    ...evaluateLaunch(
      manifest,
      { sourceCommit, sourceDirty, remoteOrigin, brevoConfigured },
      receipts,
    ),
    checkedAt: new Date().toISOString(),
  };
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  console.log(
    JSON.stringify({
      event: "release.gate",
      status: result.status,
      blockers: result.blockers,
      output: resolve(output),
    }),
  );
  if (result.status === "blocked") process.exitCode = 2;
} catch {
  console.error('{"event":"release.gate_failed","code":"invalid_input_or_existing_output"}');
  process.exitCode = 1;
}
