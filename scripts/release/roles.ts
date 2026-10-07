import type { Pool } from "pg";

export async function provisionRuntimeRoles(
  pool: Pool,
  passwords: { web: string; worker: string; monitor: string },
) {
  for (const value of Object.values(passwords))
    if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("Use generated 32-byte runtime credentials");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = (await client.query("SELECT current_database() AS name, current_user AS owner"))
      .rows[0];
    const identifier = (v: string) => `"${v.replaceAll('"', '""')}"`;
    for (const name of ["londos_runtime", "londos_web", "londos_worker", "londos_monitor"]) {
      if (!(await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [name])).rowCount)
        await client.query(
          `CREATE ROLE ${name} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
        );
    }
    for (const [name, password] of Object.entries(passwords))
      await client.query(
        `ALTER ROLE londos_${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}' CONNECTION LIMIT ${name === "web" ? 24 : name === "worker" ? 12 : 2}`,
      );
    await client.query("GRANT londos_runtime TO londos_web,londos_worker");
    await client.query(
      `REVOKE CREATE,TEMPORARY ON DATABASE ${identifier(current.name)} FROM PUBLIC`,
    );
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await client.query(
      `GRANT CONNECT ON DATABASE ${identifier(current.name)} TO londos_runtime,londos_monitor`,
    );
    await client.query("GRANT USAGE ON SCHEMA public TO londos_runtime");
    const tables = (
      await client.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename",
      )
    ).rows;
    for (const { tablename } of tables)
      await client.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON public.${identifier(tablename)} TO londos_runtime`,
      );
    await client.query("GRANT SELECT ON public.schema_migrations TO londos_runtime");
    await client.query("GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO londos_runtime");
    // No ownership/DDL/TRUNCATE/replication or policy bypass. New tables require
    // a reviewed rerun after migration; no automatic broad future-table grant.
    await client.query("CREATE SCHEMA IF NOT EXISTS londos_operations");
    await client.query("REVOKE ALL ON SCHEMA londos_operations FROM PUBLIC");
    await client.query(`CREATE OR REPLACE VIEW londos_operations.snapshot WITH (security_barrier=true) AS
      SELECT
        (SELECT count(*)::int FROM jobs WHERE state='dead') AS dead_jobs,
        (SELECT count(*)::int FROM jobs WHERE state='pending') AS pending_jobs,
        (SELECT coalesce(max(extract(epoch FROM clock_timestamp()-available_at)),0)::float8 FROM jobs WHERE state='pending' AND available_at<=clock_timestamp()) AS oldest_job_seconds,
        (SELECT count(*)::int FROM worker_heartbeats WHERE state='running' AND seen_at>clock_timestamp()-interval '30 seconds') AS healthy_workers,
        (SELECT count(*)::int FROM media_assets a WHERE state='failed' OR (state='processing' AND EXISTS(SELECT 1 FROM jobs j WHERE j.kind='media.process' AND j.payload->>'assetId'=a.id::text AND j.payload->>'version'=a.version::text AND j.state='dead'))) AS failed_media,
        (SELECT count(*)::int FROM invoices i JOIN LATERAL(SELECT coalesce(sum(amount_minor),0) AS credited FROM rent_events e WHERE e.invoice_id=i.id AND e.kind IN('payment','waiver','adjustment')) c ON true WHERE c.credited>0 AND c.credited<i.amount_minor) AS partial_invoices,
        (SELECT count(*)::int FROM request_budgets WHERE key='auth:global' AND count>=300 AND window_id>=floor(extract(epoch FROM clock_timestamp())/60)::bigint-5) AS auth_budget_pressure,
        (SELECT count(*)::int FROM shops s LEFT JOIN shop_projections p ON p.shop_id=s.id WHERE p.shop_id IS NULL OR p.version<s.version) AS projection_lag,
        (SELECT coalesce(sum(octet_length(bytes)),0)::text FROM media_blobs) AS media_bytes,
        (SELECT pg_database_size(current_database()))::text AS database_bytes,
        (SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database()) AS database_connections,
        (SELECT coalesce(sum(estimated_cost_microusd),0)::text FROM ai_provider_attempts WHERE verification='live_transport') AS recorded_ai_micro_usd`);
    await client.query("REVOKE ALL ON londos_operations.snapshot FROM PUBLIC");
    await client.query("GRANT USAGE ON SCHEMA londos_operations TO londos_monitor");
    await client.query("GRANT SELECT ON londos_operations.snapshot TO londos_monitor");
    for (const name of ["londos_web", "londos_worker", "londos_monitor"])
      await client.query(
        `ALTER ROLE ${name} SET statement_timeout = '${name === "monitor" ? "2s" : "10s"}'`,
      );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
