import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { request as httpsRequest } from "node:https";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, copyFile, stat, cp, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { Pool } from "pg";
import { docker, postgresImage, RehearsalDocker, containerLog } from "./docker";
import { seal, unseal, recoveryKey } from "./crypto";
import { canonicalSnapshot, captureRecoveryAuthority, admitRestoredCluster } from "./recovery";
import { provisionRuntimeRoles } from "./roles";
import { operationalAlerts, operationalSnapshot } from "./monitor";
import { recoveryFixtures, eraseFixture, NativeClient } from "./fixtures";
import { migrate } from "../../src/server/db/migrate";
import { coreConfig } from "../../src/server/config";
import { createAuth } from "../../src/server/security/auth";
import { resolveActor } from "../../src/server/security/authorization";
import { readCatalogue, saveProduct } from "../../src/server/catalogue";
import { readPublicShop, readPublicVariant } from "../../src/server/public-shop";
import { readInvoice, reconcileInvoice } from "../../src/server/rent";
import { LocalNotifications, LocalPrivateStorage } from "../../src/server/jobs/adapters";
import { acknowledge, type Job } from "../../src/server/jobs/queue";

const exec = promisify(execFile),
  owned = new RehearsalDocker(),
  pools: Pool[] = [];
const image = await docker([
  "image",
  "inspect",
  "--format",
  "{{.Id}}",
  process.env.LONDOS_IMAGE ?? "londos:p12-candidate",
]);
const checks: string[] = [],
  evidence: Record<string, unknown> = {
    format: "londos-p12-recovery-v1",
    startedAt: new Date().toISOString(),
    scope: "isolated fictional staging; same-host recovery copies",
    postgresImage,
  };
function passed(name: string) {
  checks.push(name);
  console.log(JSON.stringify({ check: name, result: "passed" }));
}
async function eventually(check: () => Promise<boolean>, label: string, limit = 30000) {
  const deadline = Date.now() + limit;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      /* Retry bounded startup probes without logging credentials. */
    }
    await setTimeout(250);
  }
  throw new Error(`Timed out: ${label}`);
}
function pool(url: string) {
  const p = new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 2000 });
  p.on("error", () => {});
  pools.push(p);
  return p;
}
async function port(container: string) {
  const published = await docker(["port", container, "5432/tcp"]);
  assert.match(published, /^127\.0\.0\.1:\d+$/);
  return published.split(":")[1]!;
}
const local = await mkdtemp(resolve(".local/p12-recovery-"));
process.env.LONDOS_REHEARSAL_DIAGNOSTICS = join(local, "docker-private.log");
await mkdir(join(local, "key-custody"), { mode: 0o700 });
await mkdir(join(local, "notifications"), { mode: 0o700 });
const keyPath = join(local, "key-custody", "recovery.key");
await writeFile(keyPath, randomBytes(32), { mode: 0o600, flag: "wx" });
const key = await recoveryKey(keyPath),
  password = randomBytes(32).toString("hex"),
  authSecret = randomBytes(48).toString("hex");
const passwords = {
  web: randomBytes(32).toString("hex"),
  worker: randomBytes(32).toString("hex"),
  monitor: randomBytes(32).toString("hex"),
};
const dbName = "londos_test_recovery",
  envPath = join(local, "postgres.env");
await writeFile(
  envPath,
  `POSTGRES_USER=londos_migrator\nPOSTGRES_DB=${dbName}\nPOSTGRES_PASSWORD=${password}\n`,
  { mode: 0o600 },
);
await writeFile(join(local, "key-custody", "auth-secret"), authSecret, { mode: 0o600 });
let stage = "initialization";
try {
  const network = await owned.network(),
    volume = await owned.volume("source");
  const source = await owned.run("source", [
    "--network",
    network,
    "--env-file",
    envPath,
    "--publish",
    "127.0.0.1::5432",
    "--volume",
    `${volume}:/var/lib/postgresql`,
    postgresImage,
  ]);
  const sourceUrl = `postgresql://londos_migrator:${password}@127.0.0.1:${await port(source)}/${dbName}`;
  const db = pool(sourceUrl);
  await eventually(async () => !!(await db.query("SELECT 1")).rowCount, "source database");
  Object.assign(process.env, {
    DATABASE_URL: sourceUrl,
    AUTH_SECRET: authSecret,
    AUTH_BASE_URL: "http://127.0.0.1:3200",
    LONDOS_LOCAL_ADAPTERS: "true",
    LONDOS_CORE_ENABLED: "true",
    LONDOS_DATA_SOURCE: "database",
    LONDOS_AI_REMOTE: "false",
    LONDOS_PILOT_ANALYTICS: "true",
    LONDOS_PRIVACY_ERASURE: "true",
  });
  const migrationEnv = join(local, "migration.env");
  await writeFile(
    migrationEnv,
    `DATABASE_URL=postgresql://londos_migrator:${password}@${source}:5432/${dbName}\n`,
    { mode: 0o600 },
  );
  const migrationContainer = await owned.run("migration", [
    "--network",
    network,
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--tmpfs",
    "/tmp",
    "--env-file",
    migrationEnv,
    image,
    "migrate",
  ]);
  assert.equal(await docker(["wait", migrationContainer]), "0");
  passed("compiled-dedicated-migrator-applies-frozen-001-through-018");
  stage = "native fixtures";
  await migrate(db);
  await migrate(db);
  const fixtures = await recoveryFixtures(db, local, join(local, "notifications"));
  await provisionRuntimeRoles(db, passwords);
  passed("schema-018-native-auth-mfa-finance-media-lss-fixtures");
  const baseline = await canonicalSnapshot(db);
  assert(baseline.media_blobs!.count >= 4);
  assert(baseline.product_media!.count > 0);
  assert(baseline.application_evidence!.count > 0);
  assert(baseline.rent_events!.count >= 3);
  assert(baseline.shop_revisions!.count > 0);
  // No web/worker is connected; writers are fenced for all snapshot boundaries.
  async function backup(label: string) {
    const begin = performance.now(),
      bundle = join(local, `bundle-${label}`);
    await mkdir(bundle, { mode: 0o700 });
    const remote = `/tmp/p12-${label}`;
    await docker([
      "exec",
      "--user",
      "postgres",
      source,
      "pg_basebackup",
      "-U",
      "londos_migrator",
      "-D",
      remote,
      "-X",
      "stream",
      "-c",
      "fast",
      "--manifest-checksums=SHA256",
    ]);
    await docker(["exec", "--user", "postgres", source, "pg_verifybackup", remote]);
    await docker(["exec", source, "tar", "-czf", `${remote}.tar.gz`, "-C", remote, "."]);
    await docker(["cp", `${source}:${remote}.tar.gz`, join(bundle, "postgres.tar.gz")]);
    await cp(join(local, "notifications"), join(bundle, "notifications"), { recursive: true });
    const plain = join(local, `${label}.tar`),
      encrypted = join(local, `${label}.encrypted`);
    await exec("tar", ["-cf", plain, "-C", bundle, "."]);
    await seal(plain, encrypted, key);
    const second = join(local, `${label}.second-copy.encrypted`);
    await copyFile(encrypted, second);
    assert((await readFile(encrypted)).equals(await readFile(second)));
    return {
      label,
      encrypted: second,
      bytes: (await stat(encrypted)).size,
      sha256: createHash("sha256")
        .update(await readFile(encrypted))
        .digest("hex"),
      elapsedMs: Math.round(performance.now() - begin),
      completedAt: new Date().toISOString(),
    };
  }
  stage = "pre-erasure physical backup";
  const before = await backup("before-erasure");
  passed("physical-backup-wal-sha256-manifest-encrypted-second-local-copy");
  stage = "governed erasure";
  await eraseFixture(db, fixtures);
  const authority = await captureRecoveryAuthority(db, key);
  await writeFile(
    join(local, "key-custody", "current-privacy-authority.json"),
    JSON.stringify(authority),
    { mode: 0o600 },
  );
  const afterSnapshot = await canonicalSnapshot(db);
  assert.equal(afterSnapshot.pilot_metrics!.count, 0);
  assert.equal(afterSnapshot.shop_privacy_exclusions!.count, 1);
  async function restore(b: Awaited<ReturnType<typeof backup>>) {
    const begun = performance.now(),
      directory = join(local, `restore-${b.label}`);
    await mkdir(directory, { mode: 0o700 });
    const plain = join(directory, "authenticated.tar");
    await unseal(b.encrypted, plain, key);
    await exec("tar", ["-xf", plain, "-C", directory]);
    const restoredVolume = await owned.volume(b.label),
      helper = await owned.run(`load-${b.label}`, [
        "--volume",
        `${restoredVolume}:/var/lib/postgresql`,
        postgresImage,
        "sleep",
        "infinity",
      ]);
    await docker(["cp", join(directory, "postgres.tar.gz"), `${helper}:/tmp/restore.tar.gz`]);
    await docker(["exec", helper, "mkdir", "-p", "/var/lib/postgresql/18/docker"]);
    await docker([
      "exec",
      helper,
      "tar",
      "-xzf",
      "/tmp/restore.tar.gz",
      "-C",
      "/var/lib/postgresql/18/docker",
    ]);
    await docker(["exec", helper, "chown", "-R", "postgres:postgres", "/var/lib/postgresql/18"]);
    await docker([
      "exec",
      "--user",
      "postgres",
      helper,
      "pg_verifybackup",
      "/var/lib/postgresql/18/docker",
    ]);
    await owned.remove(helper);
    const container = await owned.run(`restored-${b.label}`, [
      "--network",
      network,
      "--env-file",
      envPath,
      "--publish",
      "127.0.0.1::5432",
      "--volume",
      `${restoredVolume}:/var/lib/postgresql`,
      postgresImage,
    ]);
    const url = `postgresql://londos_migrator:${password}@127.0.0.1:${await port(container)}/${dbName}`,
      restored = pool(url);
    await eventually(
      async () => !!(await restored.query("SELECT 1")).rowCount,
      "restored database",
    );
    return {
      db: restored,
      url,
      container,
      directory,
      elapsedMs: Math.round(performance.now() - begun),
    };
  }
  stage = "stale restore rejection";
  const stale = await restore(before);
  await assert.rejects(admitRestoredCluster(stale.db, authority, key), /privacy state is stale/);
  passed("pre-erasure-physical-restore-rejected-before-web-or-worker-admission");
  stage = "current backup and restore";
  const current = await backup("after-erasure");
  // An authorized fault in the owned disposable source, never the main database.
  await db.query("DELETE FROM product_media");
  await db.query("DELETE FROM products");
  assert.equal((await db.query("SELECT count(*)::int n FROM products")).rows[0].n, 0);
  const restored = await restore(current);
  passed("accidental-bulk-catalogue-deletion-recovered-in-isolation");
  assert.deepEqual(await canonicalSnapshot(restored.db), afterSnapshot);
  passed("every-public-table-count-and-digest-equal-after-physical-restore");
  await admitRestoredCluster(restored.db, authority, key);
  passed("fresh-signed-privacy-barrier-admitted-completed-erasure-preserved");
  await assert.rejects(admitRestoredCluster(restored.db, authority, randomBytes(32)), /Untrusted/);
  passed("forged-recovery-authority-rejected");
  process.env.DATABASE_URL = restored.url;
  const roleUrl = (role: keyof typeof passwords, host = false) =>
    `postgresql://londos_${role}:${passwords[role]}@${host ? `${restored.container}:5432` : `127.0.0.1:${new URL(restored.url).port}`}/${dbName}`;
  let webDb = pool(roleUrl("web")),
    workerDb = pool(roleUrl("worker")),
    monitorDb = pool(roleUrl("monitor"));
  stage = "runtime privilege verification";
  for (const rolePool of [webDb, workerDb]) {
    await assert.rejects(rolePool.query("CREATE TABLE public.p12_forbidden(id integer)"), {
      code: "42501",
    });
    await assert.rejects(rolePool.query("TRUNCATE shops CASCADE"), { code: "42501" });
    await assert.rejects(rolePool.query("UPDATE schema_migrations SET checksum='bad'"), {
      code: "42501",
    });
    await assert.rejects(
      rolePool.query("UPDATE rent_events SET amount_minor=1 WHERE invoice_id=$1", [
        fixtures.invoiceId,
      ]),
      { code: "P0001" },
    );
    assert.equal(
      (
        await rolePool.query(
          "SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls AS unsafe FROM pg_roles WHERE rolname=current_user",
        )
      ).rows[0].unsafe,
      false,
    );
  }
  await assert.rejects(monitorDb.query('SELECT * FROM "user"'), { code: "42501" });
  const snapshot = await operationalSnapshot(monitorDb);
  assert.equal(snapshot.healthy_workers, 0);
  assert(
    operationalAlerts(snapshot, false, 1500, null).some(
      (a) => a.code === "backup_missing_or_stale",
    ),
  );
  passed("non-owner-runtime-ddl-truncate-migration-finance-denial-and-readonly-monitor");
  stage = "restored access and replay";
  const restoredAuth = createAuth(webDb, coreConfig()),
    owner = new NativeClient(restoredAuth),
    foreign = new NativeClient(restoredAuth);
  await owner.post("sign-in/email", fixtures.accounts.ownerA);
  await foreign.post("sign-in/email", fixtures.accounts.ownerB);
  const ownerActor = await resolveActor(restoredAuth, owner.headers()),
    foreignActor = await resolveActor(restoredAuth, foreign.headers());
  assert((await readCatalogue(webDb, ownerActor, fixtures.shop)).products.length > 0);
  await assert.rejects(readCatalogue(webDb, foreignActor, fixtures.shop), { status: 404 });
  const publicBefore = await readPublicShop(webDb, fixtures.shop);
  const variant = await readPublicVariant(webDb, fixtures.shop, fixtures.mediaId, "card");
  assert(variant);
  const balance = (await readInvoice(webDb, ownerActor, fixtures.invoiceId)).invoice.credited_minor;
  assert.equal(balance, "5000");
  // Persisted native operator session/MFA proof remains authoritative after restore.
  const op = await resolveActor(restoredAuth, fixtures.operator.headers());
  const financeBefore = await canonicalSnapshot(restored.db);
  await reconcileInvoice(webDb, op, fixtures.invoiceId, fixtures.repayment);
  const financeAfter = await canonicalSnapshot(restored.db);
  assert.deepEqual(financeAfter.rent_events, financeBefore.rent_events);
  const sink = new LocalNotifications(
    new LocalPrivateStorage(join(restored.directory, "notifications")),
  );
  const notificationPath = join(restored.directory, "notifications", `${fixtures.pending}.json`),
    delivery = await readFile(notificationPath);
  await sink.deliver(fixtures.pending, fixtures.payload, new AbortController().signal);
  await sink.deliver(fixtures.pending, fixtures.payload, new AbortController().signal);
  assert((await readFile(notificationPath)).equals(delivery));
  assert.equal(
    (await readdir(join(restored.directory, "notifications"))).filter(
      (n) => n === `${fixtures.pending}.json`,
    ).length,
    1,
  );
  const notification = (
    await restored.db.query(
      "UPDATE jobs SET state='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '30 seconds' WHERE id=$1 RETURNING *",
      [fixtures.pending],
    )
  ).rows[0] as Job;
  assert(await acknowledge(workerDb, notification));
  assert.equal(await acknowledge(workerDb, notification), false);
  await restored.db.query(`REINDEX DATABASE ${dbName}`);
  await restored.db.query(
    "INSERT INTO shop_projections(shop_id,version,name) SELECT id,version,name FROM shops ON CONFLICT(shop_id) DO UPDATE SET version=excluded.version,name=excluded.name,updated_at=clock_timestamp()",
  );
  assert.deepEqual(await readPublicShop(webDb, fixtures.shop), publicBefore);
  passed(
    "restored-native-auth-tenant-denial-media-rent-idempotency-notification-replay-search-rebuild",
  );
  // Admit web and worker only after signed privacy and invariant checks passed.
  stage = "compiled runtime";
  const runtimeEnv = join(local, "web.env"),
    workerEnv = join(local, "worker.env");
  const common = `AUTH_SECRET=${authSecret}\nAUTH_BASE_URL=http://127.0.0.1:3200\nLONDOS_LOCAL_ADAPTERS=true\nLONDOS_CORE_ENABLED=true\nLONDOS_DATA_SOURCE=database\nLONDOS_AI_REMOTE=false\nLONDOS_PRIVACY_ERASURE=false\nLONDOS_PILOT_ANALYTICS=false\n`;
  await writeFile(runtimeEnv, `${common}DATABASE_URL=${roleUrl("web", true)}\n`, { mode: 0o600 });
  await writeFile(
    workerEnv,
    `${common}DATABASE_URL=${roleUrl("worker", true)}\nLONDOS_WORKER_ID_FILE=/tmp/londos-worker-id\n`,
    { mode: 0o600 },
  );
  const hardening = [
    "--network",
    network,
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--pids-limit",
    "128",
    "--memory",
    "768m",
    "--cpus",
    "1",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=128m",
    "--tmpfs",
    "/app/.next/cache:rw,uid=1000,gid=1000,size=64m",
  ];
  const web = await owned.run("web", [
    ...hardening,
    "--env-file",
    runtimeEnv,
    "--publish",
    "127.0.0.1::3000",
    image,
    "web",
  ]);
  const webPort = (await docker(["port", web, "3000/tcp"])).split(":")[1]!,
    base = `http://127.0.0.1:${webPort}`;
  await eventually(async () => {
    const r = await fetch(`${base}/api/ready`);
    return r.ok && (await r.json()).ready === true;
  }, "compiled web ready");
  const privateResponse = await fetch(`${base}/api/workspace/shops`, { redirect: "manual" });
  assert.match(privateResponse.headers.get("cache-control") ?? "", /no-store/);
  const healthy = await fetch(`${base}/api/ready`);
  assert.match(healthy.headers.get("cache-control") ?? "", /no-store/);
  const worker = await owned.run("worker", [
    ...hardening,
    "--tmpfs",
    "/app/.local/notifications:rw,uid=1000,gid=1000,size=64m",
    "--env-file",
    workerEnv,
    image,
    "worker",
  ]);
  await eventually(async () => {
    await docker(["exec", worker, "node", "release-entry.mjs", "worker-health"]);
    return true;
  }, "compiled worker own heartbeat");
  passed("nonroot-readonly-compiled-web-worker-readiness-and-private-no-store");
  await docker(["stop", "--time", "35", worker]);
  assert.equal(await docker(["inspect", "--format", "{{.State.ExitCode}}", worker]), "0");
  assert.equal(
    (await restored.db.query("SELECT count(*)::int n FROM worker_heartbeats WHERE state='running'"))
      .rows[0].n,
    0,
  );
  passed("worker-sigterm-drain-and-own-heartbeat-stopped");
  await docker(["stop", "--time", "30", restored.container]);
  await eventually(async () => {
    const r = await fetch(`${base}/api/ready`);
    return r.status === 503;
  }, "database outage readiness");
  await docker(["start", restored.container]);
  await eventually(async () => {
    const r = await fetch(`${base}/api/ready`);
    return r.ok && (await r.json()).ready === true;
  }, "database recovery readiness");
  // Docker may reassign an ephemeral host port on restart. Containers use
  // stable network DNS; refresh only this host-side drill's diagnostic pools.
  const restartedUrl = new URL(restored.url);
  restartedUrl.port = await port(restored.container);
  restored.url = restartedUrl.toString();
  restored.db = pool(restored.url);
  process.env.DATABASE_URL = restored.url;
  webDb = pool(roleUrl("web"));
  workerDb = pool(roleUrl("worker"));
  monitorDb = pool(roleUrl("monitor"));
  passed("database-outage-fails-readiness-and-recovers");
  const monitorEnv = join(local, "monitor.env");
  await writeFile(
    monitorEnv,
    `DATABASE_URL=${roleUrl("monitor", true)}\nLONDOS_HEALTH_URL=http://${web}:3000/api/ready\nLONDOS_ALERT_RECIPIENT=staging-console\n`,
    { mode: 0o600 },
  );
  const monitor = await owned.run("monitor", [
    ...hardening,
    "--env-file",
    monitorEnv,
    image,
    "monitor",
  ]);
  assert.equal(await docker(["wait", monitor]), "2");
  const observed = JSON.parse(await containerLog(monitor));
  assert(observed.alerts.some((a: { code: string }) => a.code === "worker_offline"));
  assert(observed.alerts.some((a: { code: string }) => a.code === "backup_missing_or_stale"));
  assert(observed.alerts.some((a: { code: string }) => a.code === "independent_backup_unverified"));
  evidence.alertProbe = {
    exitCode: 2,
    codes: observed.alerts.map((a: { code: string }) => a.code),
    delivery: observed.delivery,
  };
  passed("compiled-readonly-monitor-emits-worker-and-backup-alerts");

  stage = "two-replica TLS cache and feature shutdown";
  const secondWeb = await owned.run("web-b", [
    ...hardening,
    "--env-file",
    runtimeEnv,
    image,
    "web",
  ]);
  const tls = join(local, "tls");
  await mkdir(tls, { mode: 0o700 });
  await exec("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-noenc",
    "-keyout",
    join(tls, "tls.key"),
    "-out",
    join(tls, "tls.crt"),
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=IP:127.0.0.1,DNS:localhost",
  ]);
  const config = (await readFile("deploy/nginx.staging.conf", "utf8"))
    .replace("web-a:3000", `${web}:3000`)
    .replace("web-b:3000", `${secondWeb}:3000`);
  await writeFile(join(tls, "nginx.conf"), config, { mode: 0o600 });
  const tlsVolume = await owned.volume("tls"),
    tlsLoader = await owned.run("tls-loader", [
      "--volume",
      `${tlsVolume}:/etc/londos`,
      postgresImage,
      "sleep",
      "infinity",
    ]);
  for (const file of ["nginx.conf", "tls.crt", "tls.key"])
    await docker(["cp", join(tls, file), `${tlsLoader}:/etc/londos/${file}`]);
  await docker(["exec", tlsLoader, "chown", "-R", "101:101", "/etc/londos"]);
  await owned.remove(tlsLoader);
  const nginxImage =
    "nginx@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94";
  const edge = await owned.run("tls-edge", [
    "--network",
    network,
    "--user",
    "101:101",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--tmpfs",
    "/tmp:rw,mode=1777,size=32m",
    "--volume",
    `${tlsVolume}:/etc/londos:ro`,
    "--publish",
    "127.0.0.1::8443",
    "--entrypoint",
    "nginx",
    nginxImage,
    "-c",
    "/etc/londos/nginx.conf",
    "-g",
    "daemon off;",
  ]);
  await writeFile(join(local, "edge-startup.log"), await containerLog(edge), { mode: 0o600 });
  const edgePort = (await docker(["port", edge, "8443/tcp"])).split(":")[1]!,
    ca = await readFile(join(tls, "tls.crt"));
  async function edgeGet(path: string, cookie = "") {
    return new Promise<{ status: number; cache: string; body: string }>((resolve, reject) => {
      const req = httpsRequest(
        { hostname: "127.0.0.1", port: edgePort, path, ca, method: "GET", headers: { cookie } },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () =>
            resolve({ status: res.statusCode!, cache: String(res.headers["cache-control"]), body }),
          );
        },
      );
      req.setTimeout(5000, () => req.destroy(new Error("TLS probe timeout")));
      req.on("error", reject);
      req.end();
    });
  }
  await eventually(async () => (await edgeGet("/api/ready")).status === 200, "TLS edge");
  const privatePath = `/api/workspace/shops/${fixtures.shop}/catalogue`,
    cookie = owner.headers().get("cookie")!;
  for (let i = 0; i < 6; i++) {
    const r = await edgeGet(privatePath, cookie);
    assert.equal(r.status, 200);
    assert.match(r.cache, /private, no-store/);
  }
  const denied = await edgeGet(privatePath);
  assert.equal(denied.status, 401);
  assert.match(denied.cache, /no-store/);
  assert(!denied.body.includes("Fictional recovery image"));
  const catalog = await readCatalogue(webDb, ownerActor, fixtures.shop),
    product = catalog.products[0]!;
  await saveProduct(webDb, ownerActor, fixtures.shop, product.id, {
    departmentId: product.department_id,
    kind: product.kind,
    name: "P12 fresh across replicas",
    slug: product.slug,
    description: product.description,
    currency: product.currency,
    priceMinor: product.price_minor,
    availability: product.availability,
    position: product.position,
    mediaId: product.media_id,
    version: product.version,
  });
  for (let i = 0; i < 6; i++)
    assert((await edgeGet(privatePath, cookie)).body.includes("P12 fresh across replicas"));
  const readiness = JSON.parse((await edgeGet("/api/ready")).body);
  assert.equal(readiness.localPrivacyErasure, false);
  assert.equal(readiness.localPilotAnalytics, false);
  assert.equal(readiness.financialOperations, false);
  assert.equal(
    (await restored.db.query("SELECT count(*)::int n FROM ai_provider_attempts")).rows[0].n,
    0,
  );
  passed("TLS-verified-two-replica-private-cache-isolation-and-fresh-canonical-reads");
  evidence.edge = {
    image: nginxImage,
    certificate: "ephemeral self-signed local CA verified by client",
    replicas: 2,
    sharedResponseCache: "disabled",
    productionDomain: false,
  };
  await owned.remove(edge);
  await owned.remove(secondWeb);
  await owned.remove(web);
  stage = "schema-compatible artifact rollback and forward fix";
  const financeStable = (await canonicalSnapshot(restored.db)).rent_events;
  const rollbackImage = process.env.LONDOS_ROLLBACK_IMAGE ?? "londos:p12-r2";
  for (const [suffix, artifact] of [
    ["rollback", rollbackImage],
    ["forward", image],
  ]) {
    const app = await owned.run(suffix!, [
      ...hardening,
      "--env-file",
      runtimeEnv,
      "--publish",
      "127.0.0.1::3000",
      artifact!,
      "web",
    ]);
    const appPort = (await docker(["port", app, "3000/tcp"])).split(":")[1]!;
    await eventually(async () => {
      const r = await fetch(`http://127.0.0.1:${appPort}/api/ready`);
      return r.ok && (await r.json()).database === true;
    }, `${suffix} readiness`);
    const r = await fetch(`http://127.0.0.1:${appPort}${privatePath}`, { headers: { cookie } });
    assert.equal(r.status, 200);
    assert((await r.text()).includes("P12 fresh across replicas"));
    assert.deepEqual((await canonicalSnapshot(restored.db)).rent_events, financeStable);
    await owned.remove(app);
  }
  evidence.rollback = {
    source: "093d61d31c7c3d46465cbe16d207e2adc336b19f",
    image: await docker(["image", "inspect", "--format", "{{.Id}}", rollbackImage]),
    packaging: "R2 application and worker with P12 entry/operations wrapper",
    schema: "018 unchanged",
    durableHistoryRestored: false,
  };
  passed("R2-compatible-application-rollback-and-P12-forward-fix-preserve-financial-history");
  evidence.image = await docker(["image", "inspect", "--format", "{{.Id}}", image]);
  evidence.backups = [before, current].map((b) => ({
    label: b.label,
    bytes: b.bytes,
    sha256: b.sha256,
    elapsedMs: b.elapsedMs,
    completedAt: b.completedAt,
  }));
  evidence.restore = {
    staleMs: stale.elapsedMs,
    currentMs: restored.elapsedMs,
    canonicalTableCount: Object.keys(afterSnapshot).length,
    zeroLostFixtureRows: true,
    provisionalRpoHours: 24,
    provisionalRtoHours: 4,
    productionTargetsApproved: false,
  };
  evidence.canonical = afterSnapshot;
  evidence.monitor = snapshot;
  evidence.independentFailureDomain = false;
  evidence.completedAt = new Date().toISOString();
  evidence.checks = checks;
  evidence.result = "passed";
  await writeFile(
    resolve("docs/evidence/P12-RECOVERY.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      result: "passed",
      checks: checks.length,
      report: "docs/evidence/P12-RECOVERY.json",
    }),
  );
} catch (error) {
  // The diagnostic file stays private; stdout never includes query text, SQL
  // parameters, account fixtures, connection strings, keys or provider bodies.
  await writeFile(join(local, "failure.txt"), String((error as Error).stack ?? error), {
    mode: 0o600,
  });
  console.error(
    JSON.stringify({ result: "failed", stage, completedChecks: checks, privateDirectory: local }),
  );
  process.exitCode = 1;
} finally {
  await Promise.all(pools.map((p) => p.end()));
  await owned.cleanup();
}
