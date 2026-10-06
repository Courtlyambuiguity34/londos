import assert from "node:assert/strict";
import { spawn, type ChildProcess, execFileSync } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { Pool } from "pg";
import type { Browser } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Actor } from "../src/server/security/authorization";
import { seedIds } from "../src/server/db/seed";
import { saveProduct } from "../src/server/catalogue";
import { readPublicShop, readPublicVariant } from "../src/server/public-shop";
import { readDesign, saveDesign } from "../src/server/shop-design";
import { startUpload, finishUpload } from "../src/server/media";
import { renderPilotContext } from "../src/server/analytics";
import { LondosDesignOrchestrator } from "../src/server/ai-design/orchestrator";
import { ProviderFailure, type AIProvider } from "../src/server/ai-design/providers";
import type { AIConfiguration } from "../src/server/ai-design/config";
import { formatMinorMoney } from "../src/modules/money";
import { PostgresSearch } from "../src/server/discovery";
function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b),
    percentile = (p: number) =>
      sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
  return {
    samples: values.length,
    p50Ms: +percentile(0.5).toFixed(2),
    p95Ms: +percentile(0.95).toFixed(2),
    p99Ms: +percentile(0.99).toFixed(2),
    maxMs: +(sorted.at(-1) ?? 0).toFixed(2),
  };
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const ended = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([ended, setTimeout(5000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await ended;
}
async function waitReady(origin: string) {
  const start = Date.now();
  while (Date.now() - start < 30000) {
    if (
      await fetch(`${origin}/api/ready`)
        .then((r) => r.ok)
        .catch(() => false)
    )
      return;
    await setTimeout(100);
  }
  throw Error("P11 replica readiness timed out");
}
export async function p11Experiments({
  pool,
  owner,
  image,
  directory,
  worker,
  origin,
  browser,
  routes,
  assetId,
  primaryWebPid,
}: {
  pool: Pool;
  owner: Actor;
  image: Buffer;
  directory: string;
  worker: ChildProcess;
  origin: string;
  browser: Browser;
  routes: string[];
  assetId: string;
  primaryWebPid: number | undefined;
}) {
  const replicaOrigin = "http://127.0.0.1:3103",
    replica = spawn(process.execPath, ["scripts/start.mjs", "--port", "3103"], {
      env: process.env,
      stdio: "ignore",
    });
  let resumedWorker: ChildProcess | undefined;
  const outages: Record<string, unknown> = {},
    mixed: Record<string, unknown>[] = [],
    observations: Record<string, unknown>[] = [],
    mobile: Record<string, unknown>[] = [];
  try {
    await waitReady(replicaOrigin);
    const origins = [origin, replicaOrigin];
    // Separate status dimensions, with one explicit operational hold cohort.
    await pool.query(
      "UPDATE tenancies t SET state=CASE get_byte(decode(md5(t.shop_id::text),'hex'),0)%10 WHEN 0 THEN 'closed' WHEN 1 THEN 'due' WHEN 2 THEN 'grace' ELSE 'active' END FROM shops s WHERE s.id=t.shop_id AND s.name LIKE 'Synthetic shop %'",
    );
    await pool.query(
      "UPDATE shop_publication p SET state='unpublished' FROM shops s WHERE s.id=p.shop_id AND s.name LIKE 'Synthetic shop %' AND get_byte(decode(md5(s.id::text),'hex'),0)%10=3",
    );
    await pool.query(
      "UPDATE shop_moderation m SET state='suspended' FROM shops s WHERE s.id=m.shop_id AND s.name LIKE 'Synthetic shop %' AND get_byte(decode(md5(s.id::text),'hex'),0)%10=4",
    );
    await pool.query(
      "INSERT INTO shop_operations(shop_id,merchant_id,paused,reason,changed_by) SELECT id,merchant_id,true,'Fictional P11 load hold',$1 FROM shops WHERE name LIKE 'Synthetic shop %' AND get_byte(decode(md5(id::text),'hex'),0)%10=5",
      [owner.userId],
    );
    const statusMix = (
      await pool.query(
        "SELECT p.state AS publication,t.state AS tenancy,m.state AS moderation,coalesce(o.paused,false) AS paused,count(*)::int AS shops FROM shops s JOIN shop_publication p ON p.shop_id=s.id JOIN tenancies t ON t.shop_id=s.id JOIN shop_moderation m ON m.shop_id=s.id LEFT JOIN shop_operations o ON o.shop_id=s.id GROUP BY 1,2,3,4 ORDER BY 1,2,3,4",
      )
    ).rows;
    const publicSlugs = (
      await pool.query(
        "SELECT s.slug FROM shops s JOIN shop_publication p ON p.shop_id=s.id JOIN tenancies t ON t.shop_id=s.id JOIN shop_moderation m ON m.shop_id=s.id LEFT JOIN shop_operations o ON o.shop_id=s.id WHERE s.name LIKE 'Synthetic shop %' AND p.state='active' AND t.state IN('active','due','grace') AND m.state='clear' AND coalesce(o.paused,false)=false ORDER BY s.id LIMIT 30",
      )
    ).rows.map((r) => r.slug as string);
    assert(publicSlugs.length === 30);
    const productId = "50000000-0000-4000-8000-000000000002";
    let writes = 0,
      writeFailures = 0,
      freshnessFailures = 0;
    async function update() {
      const p = (await pool.query("SELECT * FROM products WHERE id=$1", [productId])).rows[0],
        price = String(700000 + ++writes);
      const started = performance.now();
      await saveProduct(pool, owner, seedIds.shopA, productId, {
        departmentId: p.department_id,
        kind: p.kind,
        name: p.name,
        slug: p.slug,
        description: p.description,
        currency: p.currency,
        priceMinor: price,
        availability: "available",
        position: p.position,
        mediaId: assetId,
        version: p.version,
      });
      const results = await Promise.all(
        origins.map(async (o) => {
          const r = await fetch(`${o}/shops/annette-fashion-house/products/sample-2`),
            html = await r.text();
          return r.ok && html.includes(formatMinorMoney(price, "UGX").replaceAll("&", "&amp;"));
        }),
      );
      if (results.some((r) => !r)) freshnessFailures++;
      return performance.now() - started;
    }
    const sample = async () => {
      const activity = (
        await pool.query(
          "SELECT state,wait_event_type,count(*)::int AS connections FROM pg_stat_activity WHERE datname=current_database() GROUP BY 1,2 ORDER BY 1,2",
        )
      ).rows;
      const job = (
        await pool.query(
          "SELECT count(*)::int AS pending,coalesce(max(extract(epoch FROM now()-created_at)),0)::double precision AS oldest_seconds FROM jobs WHERE state='pending'",
        )
      ).rows[0];
      const processRows = execFileSync("ps", ["-eo", "pid=,ppid=,rss=,pcpu="], { encoding: "utf8" })
        .trim()
        .split("\n")
        .map((l) => l.trim().split(/\s+/).map(Number));
      const processIds = new Set([primaryWebPid, replica.pid, worker.pid]);
      let added = true;
      while (added) {
        added = false;
        for (const r of processRows)
          if (processIds.has(r[1]) && !processIds.has(r[0])) {
            processIds.add(r[0]);
            added = true;
          }
      }
      observations.push({
        at: new Date().toISOString(),
        activity,
        job,
        processes: processRows
          .filter((r) => processIds.has(r[0]))
          .map((r) => ({
            pid: r[0],
            ppid: r[1],
            rssBytes: r[2]! * 1024,
            cpuPercentSinceStart: r[3],
          })),
      });
    };
    for (const clients of [1, 5, 20, 40]) {
      console.log(JSON.stringify({ phase: "p11-sustained-mixed", clients, seconds: 20 }));
      const start = performance.now(),
        until = Date.now() + 20000,
        times: number[] = [],
        writeTimes: number[] = [];
      let index = 0,
        errors = 0,
        monitoring = true;
      const monitor = (async () => {
        while (monitoring) {
          await sample();
          await setTimeout(500);
        }
      })();
      const writer = (async () => {
        while (Date.now() < until) {
          try {
            writeTimes.push(await update());
          } catch {
            writeFailures++;
          }
          await setTimeout(500);
        }
      })();
      await Promise.all(
        Array.from({ length: clients }, async () => {
          while (Date.now() < until) {
            const n = index++,
              o = origins[n % 2]!,
              route =
                n % 10 < 8
                  ? routes[2 + (n % 3)]!
                  : n % 10 === 8
                    ? `/shops/${publicSlugs[n % publicSlugs.length]}`
                    : routes[1]!,
              t = performance.now();
            try {
              const r = await fetch(o + route);
              const html = await r.text();
              if (
                !r.ok ||
                /This shop could not load|Search is temporarily unavailable|Search could not load/.test(
                  html,
                ) ||
                (route.startsWith("/shops/") && !html.includes("canonical-shop"))
              )
                errors++;
            } catch {
              errors++;
            }
            times.push(performance.now() - t);
          }
        }),
      );
      await writer;
      monitoring = false;
      await monitor;
      const duration = performance.now() - start,
        result = {
          clients,
          ...stats(times),
          errors,
          durationMs: +duration.toFixed(2),
          observedRequestsPerSecond: +((times.length * 1000) / duration).toFixed(2),
          writes: stats(writeTimes),
          diagnosticOverload: clients === 40,
        };
      mixed.push(result);
      await writeFile(
        "docs/evidence/X2-P11-LOAD.json",
        JSON.stringify(
          {
            recordedAt: new Date().toISOString(),
            result: "in_progress",
            mixed,
            writes,
            writeFailures,
            freshnessFailures,
            observations,
          },
          null,
          2,
        ) + "\n",
      );
      assert(errors === 0, `Unexplained public error at concurrency ${clients}`);
    }
    assert(writeFailures === 0 && freshnessFailures === 0, "Mixed write/freshness failure");
    // Urgent canonical changes on both independent replicas; unaffected shops still load.
    const fresh = (await readPublicShop(pool, seedIds.shopA)).shop.version;
    for (const dimension of ["tenancy", "moderation", "publication", "hold"]) {
      const start = performance.now();
      if (dimension === "tenancy")
        await pool.query("UPDATE tenancies SET state='closed' WHERE shop_id=$1", [seedIds.shopA]);
      if (dimension === "moderation")
        await pool.query("UPDATE shop_moderation SET state='suspended' WHERE shop_id=$1", [
          seedIds.shopA,
        ]);
      if (dimension === "publication")
        await pool.query("UPDATE shop_publication SET state='unpublished' WHERE shop_id=$1", [
          seedIds.shopA,
        ]);
      if (dimension === "hold")
        await pool.query(
          "INSERT INTO shop_operations(shop_id,merchant_id,paused,reason,changed_by)VALUES($1,$2,true,'Fictional outage hold',$3)",
          [seedIds.shopA, seedIds.merchantA, owner.userId],
        );
      const blocked = await Promise.all(
        origins.map(async (o) => ({
          html: (await fetch(`${o}/shops/annette-fashion-house`)).status,
          media: (await fetch(`${o}/api/public/shops/${seedIds.shopA}/media/${assetId}/card`))
            .status,
          other: (await fetch(`${o}/shops/${publicSlugs[0]}`)).status,
        })),
      );
      assert(blocked.every((r) => r.html === 404 && r.media === 404 && r.other === 200));
      if (dimension === "tenancy")
        await pool.query("UPDATE tenancies SET state='active' WHERE shop_id=$1", [seedIds.shopA]);
      if (dimension === "moderation")
        await pool.query("UPDATE shop_moderation SET state='clear' WHERE shop_id=$1", [
          seedIds.shopA,
        ]);
      if (dimension === "publication")
        await pool.query("UPDATE shop_publication SET state='active' WHERE shop_id=$1", [
          seedIds.shopA,
        ]);
      if (dimension === "hold")
        await pool.query("DELETE FROM shop_operations WHERE shop_id=$1", [seedIds.shopA]);
      const restored = await Promise.all(
        origins.map(async (o) => (await fetch(`${o}/shops/annette-fashion-house`)).status),
      );
      assert(restored.every((s) => s === 200));
      outages[`eligibility_${dimension}`] = {
        blocked,
        restored,
        changeDenyRestoreMs: +(performance.now() - start).toFixed(2),
      };
    }
    assert((await readPublicShop(pool, seedIds.shopA)).shop.version === fresh);
    console.log(JSON.stringify({ phase: "p11-outage-recovery", service: "media" }));
    // Storage unavailable independently of canonical text reads.
    await pool.query("ALTER TABLE media_blobs RENAME TO p11_unavailable_blobs");
    try {
      const page = await fetch(`${origin}/shops/annette-fashion-house/products/sample-2`);
      assert(page.ok && (await page.text()).includes("Fictional Shoes sample"));
      let denied = false;
      try {
        await readPublicVariant(pool, seedIds.shopA, assetId, "card");
      } catch {
        denied = true;
      }
      assert(denied);
    } finally {
      await pool.query("ALTER TABLE p11_unavailable_blobs RENAME TO media_blobs");
    }
    assert((await readPublicVariant(pool, seedIds.shopA, assetId, "card")).length > 0);
    outages.media = { textSurvived: true, imageRestored: true };
    console.log(JSON.stringify({ phase: "p11-outage-recovery", service: "analytics" }));
    // Actual analytics endpoint cannot propagate storage failures to navigation/writes.
    const capture = renderPilotContext({
      page: "shop",
      shopId: seedIds.shopA,
      departmentId: null,
      productId: null,
      shops: [],
      resultCount: 0,
      globalDiscovery: false,
      channels: [],
    });
    assert(capture);
    const event = {
      token: capture.token,
      event: "shop_viewed",
      source: "direct",
      target: null,
      channel: null,
    };
    await pool.query("ALTER TABLE pilot_metrics RENAME TO p11_unavailable_metrics");
    let failedCaptureStatus = 0;
    try {
      const r = await fetch(`${origin}/api/guest/pilot`, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          "user-agent": "Fictional ordinary browser",
        },
        body: JSON.stringify(event),
      });
      failedCaptureStatus = r.status;
      assert(r.status === 202);
      await update();
      assert((await fetch(`${replicaOrigin}/shops/annette-fashion-house`)).ok);
    } finally {
      await pool.query("ALTER TABLE p11_unavailable_metrics RENAME TO pilot_metrics");
    }
    const restoredCapture = await fetch(`${origin}/api/guest/pilot`, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "user-agent": "Fictional ordinary browser",
      },
      body: JSON.stringify(event),
    });
    assert(restoredCapture.status === 202);
    const captured = (
      await pool.query(
        "SELECT sum(count)::text AS n FROM pilot_metrics WHERE shop_id=$1 AND event='shop_viewed'",
        [seedIds.shopA],
      )
    ).rows[0]?.n;
    assert(BigInt(captured ?? 0) > 0n);
    outages.analytics = {
      failedCaptureStatus,
      recoveredCaptureStatus: restoredCapture.status,
      recoveredCount: captured,
      canonicalWriteSurvived: true,
    };
    console.log(JSON.stringify({ phase: "p11-outage-recovery", service: "search" }));
    // Restrict only a dedicated search adapter, keeping both web pools independent.
    const searchRole = `p11_search_${randomUUID().replaceAll("-", "")}`;
    await pool.query(`CREATE ROLE ${searchRole}`);
    const searchPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c role=${searchRole}`,
      max: 1,
    });
    try {
      await pool.query(`GRANT USAGE ON SCHEMA public TO ${searchRole}`);
      await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${searchRole}`);
      await pool.query(`REVOKE SELECT ON products FROM ${searchRole}`);
      await assert.rejects(
        new PostgresSearch(searchPool).search({ query: "shoes" }),
        (e: unknown) => typeof e === "object" && e !== null && "code" in e && e.code === "42501",
      );
      assert((await fetch(`${origin}/shops/annette-fashion-house`)).ok);
      assert((await fetch(`${replicaOrigin}/shops/annette-fashion-house`)).ok);
      await pool.query(`GRANT SELECT ON products TO ${searchRole}`);
      assert((await new PostgresSearch(searchPool).search({ query: "shoes" })).results.length > 0);
      outages.search = {
        independentSearchPermissionFailure: true,
        bothDirectShopReplicasSurvived: true,
        permissionRestoredAndSearchRecovered: true,
      };
    } finally {
      await searchPool.end();
      await pool.query(`DROP OWNED BY ${searchRole}`);
      await pool.query(`DROP ROLE ${searchRole}`);
    }
    console.log(JSON.stringify({ phase: "p11-outage-recovery", service: "databaseWrites" }));
    // DB-write outage: reject a real merchant transaction using a temporary SQL trigger.
    await pool.query(
      "CREATE FUNCTION p11_reject_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'P11 write outage' USING ERRCODE='55000'; END $$",
    );
    await pool.query(
      "CREATE TRIGGER p11_write_outage BEFORE UPDATE ON products FOR EACH STATEMENT EXECUTE FUNCTION p11_reject_write()",
    );
    const beforeWrite = (
        await pool.query("SELECT version,price_minor::text FROM products WHERE id=$1", [productId])
      ).rows[0],
      generation = (
        await pool.query("SELECT generation::text FROM shop_catalogue_versions WHERE shop_id=$1", [
          seedIds.shopA,
        ])
      ).rows[0];
    let writeDenied = false;
    try {
      try {
        await update();
      } catch {
        writeDenied = true;
      }
      assert(writeDenied);
      assert.deepEqual(
        (
          await pool.query("SELECT version,price_minor::text FROM products WHERE id=$1", [
            productId,
          ])
        ).rows[0],
        beforeWrite,
      );
      assert.deepEqual(
        (
          await pool.query(
            "SELECT generation::text FROM shop_catalogue_versions WHERE shop_id=$1",
            [seedIds.shopA],
          )
        ).rows[0],
        generation,
      );
      assert((await fetch(`${origin}/shops/annette-fashion-house`)).ok);
    } finally {
      await pool.query("DROP TRIGGER p11_write_outage ON products");
      await pool.query("DROP FUNCTION p11_reject_write()");
    }
    await update();
    outages.databaseWrites = {
      denied: true,
      rolledBackCatalogueAndGeneration: true,
      canonicalReadSurvived: true,
      recovered: true,
    };
    console.log(JSON.stringify({ phase: "p11-outage-recovery", service: "worker" }));
    // Worker pause, durable old schema-v1 profile work + new media, restart, exact effects.
    await stop(worker);
    await pool.query("UPDATE shops SET version=version+1 WHERE id=$1", [seedIds.shopA]);
    const v = (await pool.query("SELECT version FROM shops WHERE id=$1", [seedIds.shopA])).rows[0]
      .version;
    const oldJob = randomUUID();
    await pool.query(
      "INSERT INTO jobs(id,kind,schema_version,dedupe_key,merchant_id,shop_id,payload)VALUES($1,'shop.profile.changed',1,$1::uuid::text,$2,$3,$4)",
      [
        oldJob,
        seedIds.merchantA,
        seedIds.shopA,
        JSON.stringify({ shopId: seedIds.shopA, version: v }),
      ],
    );
    const queued = await startUpload(pool, owner, seedIds.shopA, {
      contentType: "image/png",
      bytes: image.length,
      alt: "Worker restart coffee photograph",
    });
    await finishUpload(pool, owner, seedIds.shopA, queued.id, image, "image/png");
    assert(
      (await pool.query("SELECT state FROM media_assets WHERE id=$1", [queued.id])).rows[0]
        .state === "processing",
    );
    assert((await fetch(`${replicaOrigin}/shops/annette-fashion-house`)).ok);
    const restarted = performance.now();
    resumedWorker = spawn(process.execPath, [join(process.cwd(), "dist/worker.mjs")], {
      cwd: directory,
      env: process.env,
      stdio: "ignore",
    });
    while (
      (await pool.query("SELECT state FROM media_assets WHERE id=$1", [queued.id])).rows[0]
        .state !== "ready" ||
      (await pool.query("SELECT state FROM jobs WHERE id=$1", [oldJob])).rows[0].state !== "done"
    ) {
      assert(performance.now() - restarted < 15000);
      await setTimeout(50);
    }
    assert(
      (await pool.query("SELECT count(*)::int AS n FROM job_effects WHERE job_id=$1", [oldJob]))
        .rows[0].n === 1,
    );
    assert(
      (await pool.query("SELECT version FROM shop_projections WHERE shop_id=$1", [seedIds.shopA]))
        .rows[0].version === v,
    );
    outages.worker = {
      durableQueuedMediaAndSchemaOneProfileRecovered: true,
      effects: 1,
      recoveryMs: +(performance.now() - restarted).toFixed(2),
      publicReadSurvived: true,
    };
    console.log(JSON.stringify({ phase: "p11-outage-recovery", service: "ai" }));
    // Provider outage/recovery is deliberately a deterministic injected adapter; no live-key claim.
    const design = await readDesign(pool, owner, seedIds.shopA),
      context = {
        shop: { name: "Fictional", category: "fashion", tagline: "" },
        specification: design.specification,
        departments: design.departments.map((d) => ({ ...d, version: 1 })),
        products: design.products.map((p) => ({ ...p, version: 1 })),
      };
    const settings = {
        model: "gemini-fixture",
        keys: ["P11_FIXTURE_ONLY"],
        inputRate: 1n,
        outputRate: 1n,
      },
      config: AIConfiguration = {
        remote: true,
        providers: { gemini: settings },
        status: { gemini: "configured_unverified", openai: "credentials_unavailable" },
        fallback: false,
        authFailover: false,
        dailyCostMicroUsd: 1000000n,
      };
    let down = true;
    const provider: AIProvider = {
      kind: "gemini",
      model: settings.model,
      verification: "fixture",
      generate: async () => {
        if (down) throw new ProviderFailure("unavailable");
        return {
          text: JSON.stringify({
            patches: [{ op: "theme", theme: "blue" }],
            confidence: "high",
            review: "not_needed",
          }),
          usage: { inputTokens: 100, outputTokens: 30 },
        };
      },
    };
    const invoke = () =>
      new LondosDesignOrchestrator(config, { gemini: provider }).propose(
        context,
        "Improve the welcome",
        true,
        false,
        new AbortController().signal,
        { beforeAttempt: async () => {}, afterAttempt: async () => {}, validate: async () => {} },
      );
    await assert.rejects(
      invoke(),
      (error: unknown) => error instanceof ProviderFailure && error.code === "unavailable",
    );
    const draft = await saveDesign(pool, owner, seedIds.shopA, {
      version: design.version,
      summary: "Manual design during AI outage",
      specification: design.specification,
    });
    assert(draft.revision > 0);
    assert((await fetch(`${origin}/shops/annette-fashion-house`)).ok);
    down = false;
    assert((await invoke()).candidate?.theme === "blue");
    outages.ai = {
      injectedFixture: true,
      manualDraftAndPublicSurvived: true,
      recoveredValidatedCandidate: true,
      liveRequest: false,
    };
    console.log(JSON.stringify({ phase: "p11-outage-recovery", service: "processCache" }));
    // There is no response/cache service to fail. Kill/recreate replica 2 to discard all process state.
    await stop(replica);
    const replacement = spawn(process.execPath, ["scripts/start.mjs", "--port", "3103"], {
      env: process.env,
      stdio: "ignore",
    });
    try {
      await waitReady(replicaOrigin);
      assert((await fetch(`${replicaOrigin}/shops/annette-fashion-house`)).ok);
      outages.cache = {
        configured: false,
        sharedResponseCache: false,
        processStateDiscardedAndCanonicalReadRecovered: true,
        externalCacheValidation: "P12 ingress/CDN gate",
      };
    } finally {
      await stop(replacement);
    }
    for (const theme of ["earth", "plum", "blue"]) {
      const mobileContext = await browser.newContext({
          viewport: { width: 390, height: 844 },
          reducedMotion: "reduce",
        }),
        p = await mobileContext.newPage(),
        cdp = await p.context().newCDPSession(p);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: 200000,
        uploadThroughput: 93750,
        connectionType: "cellular3g",
      });
      // Persist through the merchant contract then explicitly publish, never mutate historical revisions.
      const state = await readDesign(pool, owner, seedIds.shopA),
        department = state.departments.find((d) => d.name === "Shoes")!,
        product = "50000000-0000-4000-8000-000000000002",
        saved = await saveDesign(pool, owner, seedIds.shopA, {
          version: state.version,
          summary: `P11 rendered ${theme} template`,
          specification: {
            ...state.specification,
            theme: theme as "earth" | "plum" | "blue",
            spaces: [
              {
                id: "welcome",
                type: "entrance",
                version: 1,
                title: "Welcome",
                body: "Fictional photographic catalogue.",
              },
              {
                id: "display",
                type: "display",
                version: 1,
                title: "Featured pieces",
                productIds: [product],
              },
              {
                id: "department",
                type: "department",
                version: 1,
                departmentId: department.id,
                limit: 8,
              },
              {
                id: "collection",
                type: "collection",
                version: 1,
                title: "Available products",
                departmentId: department.id,
                limit: 4,
                kind: "product",
                availability: "available",
              },
              {
                id: "story",
                type: "story",
                version: 1,
                title: "Our story",
                body: "Merchant information as plain text.",
              },
              {
                id: "offer",
                type: "offer",
                version: 1,
                title: "Merchant offer",
                body: "Ask the merchant for current terms.",
              },
              {
                id: "desk",
                type: "service_desk",
                version: 1,
                title: "Service desk",
                body: "Use the saved shop contact methods.",
              },
              {
                id: "gallery",
                type: "gallery",
                version: 1,
                title: "Photographic gallery",
                productIds: [product],
              },
            ],
          },
        });
      const { publishDesign } = await import("../src/server/shop-design");
      await publishDesign(pool, owner, seedIds.shopA, { ...saved, confirm: true });
      const start = performance.now();
      await p.goto(`${origin}/shops/annette-fashion-house`, { waitUntil: "networkidle" });
      const loaded = performance.now() - start;
      await p.screenshot({
        path: `docs/evidence/images/x2-p11-template-${theme}.png`,
        fullPage: true,
      });
      const violations = (
        await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
      ).violations;
      assert(violations.length === 0);
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await p.getByRole("link", { name: "Shoes", exact: true }).focus();
      assert(
        await p
          .getByRole("link", { name: "Shoes", exact: true })
          .evaluate((e) => e === document.activeElement),
      );
      await p.keyboard.press("Enter");
      await p.waitForURL("**/departments/shoes", { waitUntil: "networkidle" });
      await p.getByRole("heading", { name: "Shoes", exact: true }).waitFor();
      const semantics = await p.locator(".canonical-shop").ariaSnapshot();
      assert(semantics.includes('heading "Shoes"'));
      mobile.push({
        theme,
        viewport: "390x844",
        cpuSlowdown: 4,
        latencyMs: 150,
        downloadBitsPerSecond: 1600000,
        uploadBitsPerSecond: 750000,
        initialLoadAndNetworkIdleMs: +loaded.toFixed(2),
        axeViolations: violations.length,
        keyboardDepartmentNavigation: true,
        reducedMotion: true,
        accessibleTreeHasDepartmentHeading: true,
        physicalHandset: false,
        realScreenReader: false,
      });
      await mobileContext.close();
    }
    const required = mixed.filter((r) => r.clients !== 40) as { p95Ms: number; errors: number }[];
    await writeFile(
      "docs/evidence/X2-P11-LOAD.json",
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          result: required.every((r) => r.p95Ms <= 1500 && r.errors === 0) ? "passed" : "failed",
          mixed,
          writes,
          writeFailures,
          freshnessFailures,
          observations,
        },
        null,
        2,
      ) + "\n",
    );
    return {
      passed:
        required.every((r) => r.p95Ms <= 1500 && r.errors === 0) &&
        writeFailures === 0 &&
        freshnessFailures === 0,
      statusMix,
      mixed,
      writes,
      writeFailures,
      freshnessFailures,
      observations,
      outages,
      mobile,
      topology: {
        webReplicas: 2,
        independentProcesses: true,
        sharedPostgreSQL: true,
        separateWorker: true,
        publicResponses: "no-store",
        sharedCache: false,
        transport: "loopback, no production ingress/CDN",
      },
      limits: [
        "Closed-loop traffic reports observed throughput, not offered-rate open-loop capacity or production SLA.",
        "40-client phase observes saturation; the established 20-client budget is unchanged.",
        "Mobile is system Chromium with 4x CPU and 150ms/1.6Mbps emulation, not physical handset or representative Ugandan network.",
        "Accessibility uses axe, keyboard/focus and Chromium accessible-tree review; actual assistive-technology user validation remains external.",
        "AI outage uses a labelled fixture; external providers and remote object-storage/CDN remain unavailable.",
      ],
    };
  } finally {
    await stop(replica);
    if (resumedWorker) await stop(resumedWorker);
  }
}
