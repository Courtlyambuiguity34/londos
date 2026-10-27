import { test, expect } from "vitest";
import { mkdtemp, readFile, writeFile, readdir, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { seal, unseal, recoveryKey } from "../../scripts/release/crypto";
import { operationalAlerts } from "../../scripts/release/monitor";
import { decodeProviderIntent } from "../../src/server/ai-design/provider-contract";
import { compileIntent, type DesignContext } from "../../src/modules/ai-design/contract";

const emptyPatch = {
  theme: null,
  actions: null,
  spaceId: null,
  before: null,
  text: null,
  spaceType: null,
  title: null,
  body: null,
  departmentId: null,
  productIds: null,
  limit: null,
  kind: null,
  availability: null,
};
const wire = (patch: Record<string, unknown>) =>
  JSON.stringify({
    patches: [{ ...emptyPatch, ...patch }],
    confidence: "high",
    review: "not_needed",
  });
const context: DesignContext = {
  shop: { name: "Fictional", category: "other", tagline: "" },
  specification: { schemaVersion: 1, theme: "earth", announcement: "", spaces: [], actions: [] },
  departments: [],
  products: [],
};
test("shallow provider wire preserves canonical theme and semantic section validation", () => {
  const theme = JSON.parse(decodeProviderIntent(wire({ op: "theme", theme: "plum" })));
  expect(compileIntent(context, theme).theme).toBe("plum");
  const story = JSON.parse(
    decodeProviderIntent(
      wire({
        op: "add_space",
        spaceId: "story",
        spaceType: "story",
        title: "About",
        body: "Fictional story",
      }),
    ),
  );
  expect(compileIntent(context, story).spaces).toEqual([
    { id: "story", type: "story", version: 1, title: "About", body: "Fictional story" },
  ]);
});
test.each([
  { op: "theme", theme: "plum", body: "extra" },
  { op: "execute", text: "code" },
  { op: "theme", theme: "plum", unknown: "field" },
  {
    op: "add_space",
    spaceId: "gallery",
    spaceType: "gallery",
    title: "Images",
    productIds: Array.from({ length: 5 }, () => randomUUID()),
  },
  { op: "replace_space", spaceId: "bad id", spaceType: "contact" },
])("provider wire refuses extra fields and invalid canonical patch %#", (patch) => {
  expect(() => decodeProviderIntent(wire(patch))).toThrow();
});
test("provider-created section anchors are normalized without accepting invalid existing section IDs", () => {
  const value = JSON.parse(
    decodeProviderIntent(wire({ op: "add_space", spaceId: "Contact area", spaceType: "contact" })),
  );
  expect(compileIntent(context, value).spaces[0]?.id).toBe("contact-area");
  expect(() =>
    decodeProviderIntent(wire({ op: "remove_space", spaceId: "Contact area" })),
  ).toThrow();
});
test("provider conversion still requires current owned catalogue references", () => {
  const value = JSON.parse(
    decodeProviderIntent(
      wire({
        op: "add_space",
        spaceId: "shoes",
        spaceType: "department",
        departmentId: randomUUID(),
        limit: 4,
      }),
    ),
  );
  expect(() => compileIntent(context, value)).toThrow("unavailable_reference");
});
test("authenticated backup roundtrip refuses wrong keys, tampering, truncation and overwrite without releasing plaintext", async () => {
  const dir = await mkdtemp(join(tmpdir(), "londos-p12-crypto-"));
  try {
    const bytes = randomBytes(2 * 1024 * 1024),
      key = randomBytes(32),
      source = join(dir, "input.tar"),
      sealed = join(dir, "sealed"),
      restored = join(dir, "restored");
    await writeFile(source, bytes, { mode: 0o600 });
    await seal(source, sealed, key);
    await unseal(sealed, restored, key);
    expect((await readFile(restored)).equals(bytes)).toBe(true);
    const original = await readFile(sealed);
    await expect(seal(source, sealed, key)).rejects.toThrow();
    expect((await readFile(sealed)).equals(original)).toBe(true);
    await expect(unseal(sealed, restored, key)).rejects.toThrow();
    expect((await readFile(restored)).equals(bytes)).toBe(true);
    for (const kind of ["wrong-key", "tampered", "truncated"]) {
      const path = join(dir, kind),
        out = join(dir, kind + "-plaintext"),
        changed = Buffer.from(original);
      if (kind === "tampered") changed[changed.length - 30] = changed[changed.length - 30]! ^ 1;
      await writeFile(
        path,
        kind === "truncated" ? changed.subarray(0, changed.length - 1) : changed,
      );
      await expect(
        unseal(path, out, kind === "wrong-key" ? randomBytes(32) : key),
      ).rejects.toThrow();
      await expect(readFile(out)).rejects.toMatchObject({ code: "ENOENT" });
    }
    expect((await readdir(dir)).some((n) => n.endsWith(".partial"))).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("recovery key refuses a readable-by-others file and wrong size", async () => {
  const dir = await mkdtemp(join(tmpdir(), "londos-p12-key-")),
    path = join(dir, "key");
  try {
    await writeFile(path, randomBytes(32), { mode: 0o600 });
    expect((await recoveryKey(path)).length).toBe(32);
    await chmod(path, 0o644);
    await expect(recoveryKey(path)).rejects.toThrow();
    await chmod(path, 0o600);
    await writeFile(path, "short");
    await expect(recoveryKey(path)).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("monitoring detects unavailable readiness, queue/media/rent/auth pressure and stale or missing independent backups", () => {
  const alerts = operationalAlerts(
    {
      healthy_workers: 0,
      oldest_job_seconds: 61,
      dead_jobs: 1,
      failed_media: 1,
      partial_invoices: 1,
      auth_budget_pressure: 1,
      database_connections: 70,
    },
    false,
    1001,
    null,
  );
  expect(alerts.map((a) => a.code)).toEqual([
    "web_not_ready",
    "worker_offline",
    "queue_age",
    "dead_jobs",
    "failed_media",
    "rent_exceptions",
    "auth_pressure",
    "database_connections",
    "web_probe_latency",
    "backup_missing_or_stale",
    "independent_backup_unverified",
  ]);
  const now = Date.now();
  expect(
    operationalAlerts(
      { healthy_workers: 1 },
      true,
      2,
      { completedAt: new Date(now).toISOString(), verified: true, independentCopy: true },
      now,
    ),
  ).toEqual([]);
  expect(
    operationalAlerts(
      { healthy_workers: 1 },
      true,
      2,
      { completedAt: "invalid", verified: true, independentCopy: true },
      now,
    ).map((a) => a.code),
  ).toContain("backup_missing_or_stale");
});
