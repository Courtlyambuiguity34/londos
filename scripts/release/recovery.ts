import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";

async function tableDigest(pool: Pool, table: string, condition = "true") {
  // Tables/conditions are source constants, never HTTP or untrusted input.
  const rows = (
    await pool.query(
      `SELECT to_jsonb(t)::text AS value FROM ${table} t WHERE ${condition} ORDER BY to_jsonb(t)::text`,
    )
  ).rows;
  const hash = createHash("sha256");
  for (const row of rows) hash.update(row.value).update("\n");
  return { count: rows.length, sha256: hash.digest("hex") };
}
export async function canonicalSnapshot(pool: Pool) {
  const tables = (
    await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
  ).rows;
  const result: Record<string, { count: number; sha256: string }> = {};
  for (const { tablename } of tables) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tablename)) throw new Error("Unexpected table identifier");
    result[tablename] = await tableDigest(pool, `public."${tablename}"`);
  }
  return result;
}
async function privacyDigest(pool: Pool) {
  const records = [];
  for (const table of [
    "privacy_requests",
    "privacy_holds",
    "privacy_events",
    "shop_privacy_exclusions",
  ])
    records.push([table, await tableDigest(pool, table)]);
  records.push([
    "erased_enquiries",
    await tableDigest(pool, "guest_requests", "erased_at IS NOT NULL"),
  ]);
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}
export type RecoveryAuthority = {
  format: "londos-recovery-authority-v1";
  database: string;
  cluster: string;
  capturedAt: string;
  privacyDigest: string;
  migrations: { name: string; checksum: string }[];
};
export type SignedRecoveryAuthority = { authority: RecoveryAuthority; signature: string };
const signature = (authority: RecoveryAuthority, key: Buffer) =>
  createHmac("sha256", key)
    .update("londos-recovery-authority-v1\n")
    .update(JSON.stringify(authority))
    .digest("hex");

export async function captureRecoveryAuthority(
  pool: Pool,
  key: Buffer,
): Promise<SignedRecoveryAuthority> {
  const identity = (
    await pool.query(
      "SELECT current_database() AS database,system_identifier::text AS cluster FROM pg_control_system()",
    )
  ).rows[0];
  const authority: RecoveryAuthority = {
    format: "londos-recovery-authority-v1",
    ...identity,
    capturedAt: new Date().toISOString(),
    privacyDigest: await privacyDigest(pool),
    migrations: (await pool.query("SELECT name,checksum FROM schema_migrations ORDER BY name"))
      .rows,
  };
  return { authority, signature: signature(authority, key) };
}

export async function admitRestoredCluster(
  pool: Pool,
  signed: SignedRecoveryAuthority,
  key: Buffer,
) {
  if (
    !signed?.authority ||
    signed.authority.format !== "londos-recovery-authority-v1" ||
    !/^[a-f0-9]{64}$/.test(signed.signature ?? "") ||
    !timingSafeEqual(
      Buffer.from(signed.signature, "hex"),
      Buffer.from(signature(signed.authority, key), "hex"),
    )
  )
    throw new Error("Untrusted recovery authority");
  const age = Date.now() - Date.parse(signed.authority.capturedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 30 * 60_000)
    throw new Error("A fresh authoritative privacy barrier is required");
  const current = await captureRecoveryAuthority(pool, key);
  if (
    current.authority.database !== signed.authority.database ||
    current.authority.cluster !== signed.authority.cluster
  )
    throw new Error("Restored cluster identity mismatch");
  if (JSON.stringify(current.authority.migrations) !== JSON.stringify(signed.authority.migrations))
    throw new Error("Restored schema mismatch");
  if (current.authority.privacyDigest !== signed.authority.privacyDigest)
    throw new Error("Restored privacy state is stale; keep access and workers isolated");
  const violations =
    await pool.query(`SELECT 1 FROM privacy_requests r WHERE state='completed' AND (
    (kind='analytics' AND (NOT EXISTS(SELECT 1 FROM shop_privacy_exclusions e WHERE e.case_id=r.id AND e.shop_id=r.target_id AND e.merchant_id=r.merchant_id) OR EXISTS(SELECT 1 FROM pilot_metrics m WHERE m.shop_id=r.target_id AND m.merchant_id=r.merchant_id))) OR
    (kind='verification' AND EXISTS(SELECT 1 FROM application_evidence e WHERE e.application_id=r.target_id AND e.merchant_id=r.merchant_id)) OR
    (kind='enquiry' AND EXISTS(SELECT 1 FROM guest_requests g WHERE g.id=r.target_id AND (g.erased_at IS NULL OR g.name<>'[Erased]' OR g.reply_to<>'[Erased]' OR g.message<>'[Erased]')))) LIMIT 1`);
  if (violations.rowCount) throw new Error("Restored privacy effect is inconsistent");
  return {
    admitted: true,
    checkedAt: new Date().toISOString(),
    schema: signed.authority.migrations.at(-1)!.name,
    privacyBarrierMatched: true,
    publication: "operator-controlled; this function opens no network service",
  };
}
