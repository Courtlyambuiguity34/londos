import { randomUUID, randomBytes } from "node:crypto";
import { spawn, type ChildProcess, execFileSync } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir, availableParallelism, platform, release } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { gzipSync } from "node:zlib";
import { Pool } from "pg";
import { p11Experiments } from "./p11-experiments";
import { chromium } from "@playwright/test";
import { loadLocalEnv } from "./local-env";
import { requireDevelopmentDatabase } from "../src/server/db/development";
import { migrate } from "../src/server/db/migrate";
import { seed, seedIds } from "../src/server/db/seed";
import { createAuth } from "../src/server/security/auth";
import { coreConfig } from "../src/server/config";
import { resolveActor } from "../src/server/security/authorization";
import { readDesign, saveDesign, patchDesign, publishDesign } from "../src/server/shop-design";
import { readPublicShop } from "../src/server/public-shop";
import { PostgresSearch } from "../src/server/discovery";
import { saveProduct } from "../src/server/catalogue";
import { changeProfile } from "../src/server/workspace";
import { startUpload, finishUpload } from "../src/server/media";

class CheckFailure extends Error {}
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new CheckFailure(message);
}
function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: values.length,
    p50Ms: +sorted[Math.floor(sorted.length * 0.5)]!.toFixed(2),
    p95Ms: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!.toFixed(2),
    p99Ms: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))]!.toFixed(2),
    maxMs: +sorted.at(-1)!.toFixed(2),
  };
}
async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  const done = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([done, setTimeout(5000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await done;
}
async function safeFile(path: string) {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return null;
  }
}
async function processResources(root: number | undefined) {
  if (!root) return { rssBytes: 0, cpuSeconds: 0 };
  let rssBytes = 0,
    cpuSeconds = 0;
  const pending = [root],
    seen = new Set<number>();
  // Node can spawn from another thread; Linux's per-thread children file may
  // omit the standalone server. PPID traversal includes the whole process tree.
  const processes = execFileSync("ps", ["-e", "-o", "pid=,ppid="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
  const ticks = Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }));
  while (pending.length) {
    const id = pending.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const status = await safeFile(`/proc/${id}/status`),
      stat = await safeFile(`/proc/${id}/stat`);
    rssBytes += Number(status?.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) * 1024;
    if (stat) {
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      cpuSeconds += (Number(fields[11]) + Number(fields[12])) / ticks;
    }
    pending.push(...processes.filter((row) => row[1] === id).map((row) => row[0]!));
  }
  return { rssBytes, cpuSeconds };
}
async function main() {
  loadLocalEnv();
  const parentURL = process.env.DATABASE_URL!;
  assert(parentURL, "Start the local database first.");
  const parent = new Pool({ connectionString: parentURL }),
    name = `londos_test_${randomUUID().replaceAll("-", "")}`,
    directory = await mkdtemp(join(tmpdir(), "londos-p11-benchmark-"));
  let pool: Pool | undefined,
    web: ChildProcess | undefined,
    worker: ChildProcess | undefined,
    browser: Awaited<ReturnType<typeof chromium.launch>> | undefined,
    created = false;
  try {
    await requireDevelopmentDatabase(parent);
    await parent.query(`CREATE DATABASE ${name}`);
    created = true;
    const url = new URL(parentURL);
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    process.env.AUTH_BASE_URL = "http://127.0.0.1:3102";
    process.env.AUTH_SECRET = randomBytes(48).toString("hex");
    process.env.LONDOS_LOCAL_ADAPTERS = "true";
    process.env.LONDOS_CORE_ENABLED = "true";
    process.env.LONDOS_DATA_SOURCE = "database";
    process.env.LONDOS_AI_REMOTE = "false";
    process.env.LONDOS_PILOT_ANALYTICS = "true";
    pool = new Pool({ connectionString: url.toString(), max: 4 });
    pool.on("error", () => console.error(JSON.stringify({ event: "benchmark.idle_error" })));
    await migrate(pool);
    const authentication = createAuth(pool, coreConfig(), true),
      accounts = await seed(pool, authentication, directory);
    console.log(
      JSON.stringify({ phase: "generate-isolated-dataset", shops: 1500, products: 150000 }),
    );
    const generator = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/generate.ts",
        "--shops=1500",
        "--products=150000",
        "--seed=londos-x2-v1",
      ],
      { stdio: ["ignore", "inherit", "ignore"], env: process.env },
    );
    assert((await once(generator, "exit"))[0] === 0, "Synthetic generation failed.");
    // Add five deterministic collections per synthetic shop, in this disposable
    // benchmark database only; never rebalance the existing development volume.
    await pool.query(
      `WITH rows AS (SELECT s.id AS shop_id,s.merchant_id,g.i,md5(s.id::text||':collection:'||g.i) AS h FROM shops s CROSS JOIN generate_series(1,5) AS g(i) WHERE s.name LIKE 'Synthetic shop %') INSERT INTO departments(id,shop_id,merchant_id,name,slug,position) SELECT (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid,shop_id,merchant_id,'Collection '||i,'collection-'||i,i FROM rows`,
    );
    await pool.query(
      "UPDATE products q SET department_id=d.id FROM departments d WHERE d.shop_id=q.shop_id AND d.slug='collection-'||(get_byte(decode(md5(q.id::text),'hex'),0)%5+1) AND q.name LIKE 'Synthetic %'",
    );
    await pool.query(
      `INSERT INTO shop_revisions(id,shop_id,merchant_id,revision,schema_version,design,summary) SELECT gen_random_uuid(),s.id,s.merchant_id,1,1,jsonb_build_object('schemaVersion',1,'theme','earth','announcement','','spaces',d.spaces,'actions','[]'::jsonb),'Synthetic benchmark template' FROM shops s CROSS JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id','collection-'||position,'type','department','version',1,'departmentId',id,'limit',8) ORDER BY position) AS spaces FROM departments WHERE shop_id=s.id AND position BETWEEN 1 AND 4) d WHERE s.name LIKE 'Synthetic shop %'`,
    );
    await pool.query(
      "INSERT INTO shop_designs(shop_id,merchant_id,version,last_revision,draft_id,published_id)SELECT shop_id,merchant_id,1,1,id,id FROM shop_revisions WHERE summary='Synthetic benchmark template'",
    );
    for (const table of [
      "shops",
      "products",
      "departments",
      "shop_designs",
      "shop_publication",
      "tenancies",
      "shop_moderation",
    ])
      await pool.query(`ANALYZE ${table}`);
    const actorFor = async (account: typeof accounts.ownerA) => {
      const response = await authentication.handler(
        new Request(`${coreConfig().baseURL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { origin: coreConfig().baseURL, "Content-Type": "application/json" },
          body: JSON.stringify({ email: account.email, password: account.password }),
        }),
      );
      assert(response.status === 200, "Fixture login failed.");
      return resolveActor(
        authentication,
        new Headers({
          cookie: response.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; "),
        }),
      );
    };
    const owner = await actorFor(accounts.ownerA),
      other = await actorFor(accounts.ownerB);
    await changeProfile(pool, owner, seedIds.shopA, {
      name: "Annette Fashion House",
      category: "fashion",
      tagline: "Fictional architecture boutique",
      version: 1,
    });
    const initial = await readDesign(pool, owner, seedIds.shopA),
      saved = await saveDesign(pool, owner, seedIds.shopA, {
        version: 0,
        summary: "Architecture template",
        specification: initial.specification,
      });
    const shoes = initial.specification.spaces.find(
        (s) =>
          s.type === "department" &&
          initial.departments.find((d) => d.id === s.departmentId)?.name === "Shoes",
      )!,
      bags = initial.specification.spaces.find(
        (s) =>
          s.type === "department" &&
          initial.departments.find((d) => d.id === s.departmentId)?.name === "Handbags",
      )!;
    const patched = await patchDesign(pool, owner, seedIds.shopA, {
      version: saved.version,
      patch: { op: "move", spaceId: shoes.id, before: bags.id },
    });
    await publishDesign(pool, owner, seedIds.shopA, { ...patched, confirm: true });
    let attackDenied = false;
    try {
      await saveDesign(pool, other, seedIds.shopA, {
        version: 0,
        summary: "Foreign mutation",
        specification: initial.specification,
      });
    } catch (error) {
      attackDenied =
        typeof error === "object" && error !== null && "status" in error && error.status === 404;
    }
    assert(attackDenied, "Tenant attack did not deny.");
    const departments = (await readPublicShop(pool, seedIds.shopA)).departments,
      shoeDepartment = departments.find((d) => d.name === "Shoes")!;
    const updateStart = performance.now();
    await saveProduct(pool, owner, seedIds.shopA, "50000000-0000-4000-8000-000000000002", {
      departmentId: shoeDepartment.id,
      kind: "product",
      name: "Fictional Shoes sample",
      slug: "sample-2",
      description: "Sample architecture product",
      currency: "UGX",
      priceMinor: "133700",
      availability: "available",
      position: 0,
      mediaId: null,
      version: 1,
    });
    assert(
      (await readPublicShop(pool, seedIds.shopA)).products.find((p) => p.slug === "sample-2")
        ?.price_minor === "133700",
      "Current price failed.",
    );
    const freshnessMs = performance.now() - updateStart;
    worker = spawn(process.execPath, [join(process.cwd(), "dist/worker.mjs")], {
      cwd: directory,
      env: process.env,
      stdio: "ignore",
    });
    const image = await readFile("tests/fixtures/p11-coffee.png"),
      asset = await startUpload(pool, owner, seedIds.shopA, {
        contentType: "image/png",
        bytes: image.length,
        alt: "Coffee cup photograph, CC0 Rachel Michetti",
      }),
      uploadStart = performance.now();
    await finishUpload(pool, owner, seedIds.shopA, asset.id, image, "image/png");
    const uploadMs = performance.now() - uploadStart,
      processingStart = performance.now();
    while (
      (await pool.query("SELECT state FROM media_assets WHERE id=$1", [asset.id])).rows[0]
        ?.state !== "ready"
    ) {
      assert(performance.now() - processingStart < 15000, "Image processing timed out.");
      await setTimeout(50);
    }
    const processingMs = performance.now() - processingStart,
      variants = (
        await pool.query(
          "SELECT variant,width,height,octet_length(bytes)::int AS bytes FROM media_blobs WHERE asset_id=$1 ORDER BY variant",
          [asset.id],
        )
      ).rows;
    assert(!variants.some((v) => v.variant === "quarantine"), "Quarantine survived processing.");
    await saveProduct(pool, owner, seedIds.shopA, "50000000-0000-4000-8000-000000000002", {
      departmentId: shoeDepartment.id,
      kind: "product",
      name: "Fictional Shoes sample",
      slug: "sample-2",
      description: "Sample architecture product",
      currency: "UGX",
      priceMinor: "133700",
      availability: "available",
      position: 0,
      mediaId: asset.id,
      version: 2,
    });
    // Fill the maximum 32-card entrance with distinct normalized photo URLs.
    // Every photo uses the real upload/worker/quota/attachment path in this guarded DB.
    const photographicProcessingMs: number[] = [];
    for (const [n, d] of initial.departments.entries())
      for (let i = 0; i < 8; i++) {
        if (n === 1 && i === 0) continue;
        const photo = await startUpload(pool, owner, seedIds.shopA, {
          contentType: "image/png",
          bytes: image.length,
          alt: "CC0 coffee photograph for a fictional catalogue item",
        });
        const t = performance.now();
        await finishUpload(pool, owner, seedIds.shopA, photo.id, image, "image/png");
        while (
          (await pool.query("SELECT state FROM media_assets WHERE id=$1", [photo.id])).rows[0]
            .state !== "ready"
        ) {
          assert(performance.now() - t < 15000, "Photographic fixture processing failed");
          await setTimeout(50);
        }
        photographicProcessingMs.push(performance.now() - t);
        await saveProduct(
          pool,
          owner,
          seedIds.shopA,
          i === 0 ? `50000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}` : null,
          {
            departmentId: d.id,
            kind: "product",
            name:
              i === 0 ? `Fictional ${d.name} sample` : `Fictional coffee piece ${n + 1}-${i + 1}`,
            slug: i === 0 ? `sample-${n + 1}` : `coffee-${n + 1}-${i + 1}`,
            description: "Photographic transfer fixture, no actual merchant product claim",
            currency: "UGX",
            priceMinor: "133700",
            availability: "available",
            position: i,
            mediaId: photo.id,
            version: i === 0 ? 1 : 0,
          },
        );
      }
    web = spawn(process.execPath, ["scripts/start.mjs", "--port", "3102"], {
      env: process.env,
      stdio: "ignore",
    });
    const origin = "http://127.0.0.1:3102";
    for (let attempt = 0; attempt < 120; attempt++) {
      const ready = await fetch(`${origin}/api/ready`)
        .then((r) => r.ok)
        .catch(() => false);
      if (ready) break;
      assert(attempt < 119, "Web startup timed out.");
      await setTimeout(250);
    }
    const counts = (
      await pool.query(
        "SELECT (SELECT count(*)::int FROM shops) AS shops,(SELECT count(*)::int FROM products) AS products,(SELECT count(*)::int FROM departments) AS departments,(SELECT count(*)::int FROM shop_designs) AS designs",
      )
    ).rows[0];
    console.log(JSON.stringify({ phase: "measure-canonical-services", counts }));
    let commands = 0,
      selects = 0,
      captured: { text: string; values: unknown[] } | null = null;
    // Replace existing idle connections so instrumentation wraps each new client once.
    await pool.end();
    pool = new Pool({ connectionString: url.toString(), max: 4 });
    pool.on("error", () => console.error(JSON.stringify({ event: "benchmark.idle_error" })));
    pool.on("connect", (client) => {
      const query = client.query.bind(client);
      client.query = ((...args: unknown[]) => {
        commands++;
        if (typeof args[0] === "string" && /^\s*(SELECT|WITH)\b/i.test(args[0])) selects++;
        if (typeof args[0] === "string" && args[0].startsWith("WITH eligible AS"))
          captured = { text: args[0], values: args[1] as unknown[] };
        return Reflect.apply(query, client, args);
      }) as typeof client.query;
    });
    const search = new PostgresSearch(pool),
      searchTimes: number[] = [],
      renderTimes: number[] = [];
    await search.search({ query: "shoes" });
    await readPublicShop(pool, seedIds.shopA);
    commands = 0;
    selects = 0;
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const result = await search.search({ query: "shoes" });
      assert(
        result.results.some((r) => r.id === seedIds.shopA) &&
          new Set(result.results.map((r) => r.id)).size === result.results.length,
        "Discovery diversity/context failed.",
      );
      searchTimes.push(performance.now() - start);
    }
    const searchCommands = { commandsPerCall: commands / 20, selectsPerCall: selects / 20 };
    commands = 0;
    selects = 0;
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      await readPublicShop(pool, seedIds.shopA);
      renderTimes.push(performance.now() - start);
    }
    const renderCommands = { commandsPerCall: commands / 20, selectsPerCall: selects / 20 };
    assert(captured, "Search plan query was not observed.");
    const observed = captured as { text: string; values: unknown[] };
    const plan = (
      await pool.query(`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) ${observed.text}`, observed.values)
    ).rows[0]["QUERY PLAN"];
    await mkdir("docs/evidence", { recursive: true });
    await writeFile("docs/evidence/X2-P11-SEARCH-PLAN.json", JSON.stringify(plan, null, 2) + "\n");
    const routes = [
        "/",
        "/search?q=shoes",
        "/shops/annette-fashion-house",
        "/shops/annette-fashion-house/departments/shoes",
        "/shops/annette-fashion-house/products/sample-2",
      ],
      http: Record<string, unknown> = {};
    for (const route of routes) {
      const timings: number[] = [],
        coldTimings: number[] = [];
      let bytes = Buffer.alloc(0);
      for (let i = 0; i < 12; i++) {
        const start = performance.now(),
          response = await fetch(`${origin}${route}`);
        assert(response.ok, "SSR HTTP failure.");
        bytes = Buffer.from(await response.arrayBuffer());
        assert(!bytes.includes(Buffer.from(process.env.AUTH_SECRET!)), "Runtime secret in HTML.");
        (i >= 2 ? timings : coldTimings).push(performance.now() - start);
      }
      http[route] = {
        ...stats(timings),
        firstTwoRouteRequests: stats(coldTimings),
        cachePath: "no-store canonical SQL; first route requests, not a cold PostgreSQL disk cache",
        rawHtmlBytes: bytes.length,
        estimatedGzipHtmlBytes: gzipSync(bytes).length,
      };
    }
    const beforeWeb = await processResources(web.pid),
      beforeWorker = await processResources(worker.pid);
    console.log(JSON.stringify({ phase: "fixed-burst", clients: 20, requests: 200 }));
    const burstTimes: number[] = [];
    let errors = 0,
      next = 0;
    const loadStart = performance.now();
    await Promise.all(
      Array.from({ length: 20 }, async () => {
        while (next < 200) {
          const index = next++,
            start = performance.now();
          try {
            const response = await fetch(`${origin}${routes[index % routes.length]}`);
            const html = await response.text(),
              route = routes[index % routes.length]!;
            if (
              !response.ok ||
              /This shop could not load|Search is temporarily unavailable|Search could not load/.test(
                html,
              ) ||
              (route.startsWith("/shops/") && !html.includes("canonical-shop"))
            )
              errors++;
          } catch {
            errors++;
          }
          burstTimes.push(performance.now() - start);
        }
      }),
    );
    const durationMs = performance.now() - loadStart,
      afterWeb = await processResources(web.pid),
      afterWorker = await processResources(worker.pid);
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
      transfers: Record<string, unknown> = {};
    for (const route of [
      "/search?q=shoes",
      "/shops/annette-fashion-house/products/sample-2",
      "/shops/annette-fashion-house",
    ]) {
      await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
      transfers[route] = await page.evaluate(() => {
        const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        return {
          javascriptEncodedBytes: resources
            .filter((r) => r.initiatorType === "script")
            .reduce((n, r) => n + r.encodedBodySize, 0),
          imageEncodedBytes: resources
            .filter((r) => r.initiatorType === "img")
            .reduce((n, r) => n + r.encodedBodySize, 0),
          cssEncodedBytes: resources
            .filter((r) => new URL(r.name).pathname.endsWith(".css"))
            .reduce((n, r) => n + r.encodedBodySize, 0),
          totalResourceEncodedBytes: resources.reduce((n, r) => n + r.encodedBodySize, 0),
          navigationTransferBytes: (
            performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming
          ).transferSize,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
    }
    await page.goto(`${origin}/search?q=shoes`, { waitUntil: "networkidle" });
    await mkdir("docs/evidence/images", { recursive: true });
    await page.screenshot({
      path: "docs/evidence/images/x2-p11-search.png",
      fullPage: true,
    });
    const experiments = await p11Experiments({
      pool,
      owner,
      image,
      directory,
      worker,
      origin,
      browser,
      routes,
      assetId: asset.id,
      primaryWebPid: web.pid,
    });
    const searchStats = stats(searchTimes),
      renderStats = stats(renderTimes),
      burstStats = stats(burstTimes),
      routeValues = Object.values(http) as { p95Ms: number; estimatedGzipHtmlBytes: number }[],
      transferValues = Object.values(transfers) as {
        javascriptEncodedBytes: number;
        imageEncodedBytes: number;
        cssEncodedBytes: number;
        horizontalOverflow: boolean;
      }[];
    const budgets = {
      searchP95Ms: 250,
      ssrP95Ms: 500,
      burstP95Ms: 1500,
      gzipHtmlBytes: 80 * 1024,
      initialJavaScriptBytes: 200 * 1024,
      initialCssBytes: 40 * 1024,
      initialImageBytes: 350 * 1024,
      uploadMs: 1000,
      workerReadyMs: 5000,
    };
    const passed =
      searchStats.p95Ms <= budgets.searchP95Ms &&
      routeValues.every(
        (r) => r.p95Ms <= budgets.ssrP95Ms && r.estimatedGzipHtmlBytes <= budgets.gzipHtmlBytes,
      ) &&
      errors === 0 &&
      burstStats.p95Ms <= budgets.burstP95Ms &&
      transferValues.every(
        (r) =>
          r.javascriptEncodedBytes <= budgets.initialJavaScriptBytes &&
          r.imageEncodedBytes <= budgets.initialImageBytes &&
          r.cssEncodedBytes <= budgets.initialCssBytes &&
          !r.horizontalOverflow,
      ) &&
      uploadMs <= budgets.uploadMs &&
      processingMs <= budgets.workerReadyMs &&
      experiments.passed;
    const report = {
      recordedAt: new Date().toISOString(),
      method:
        "Isolated generated database; 20 sequential service samples; first two and ten warm loopback SSR samples; fixed 20-client/200-request burst, then two replicas with four 20-second mixed-load phases and isolated outage/recovery cases; system Chromium at 390x844 with 4x CPU/150ms/1.6Mbps emulation. No other test suite runs during measurement.",
      counts,
      experiments,
      sourceBaseline: "31adef250bfbeaacdd1dd3e57d7104ff05cadc4f",
      hardware: {
        node: process.versions.node,
        os: platform(),
        kernel: release(),
        availableParallelism: availableParallelism(),
        cgroupCpuMax: await safeFile("/sys/fs/cgroup/cpu.max"),
        cgroupMemoryMax: await safeFile("/sys/fs/cgroup/memory.max"),
      },
      budgets,
      result: passed ? "passed" : "failed",
      search: { ...searchStats, ...searchCommands },
      shopService: { ...renderStats, ...renderCommands },
      http,
      burst: {
        ...burstStats,
        clients: 20,
        requests: 200,
        errors,
        durationMs: +durationMs.toFixed(2),
        observedRequestsPerSecond: +((200 * 1000) / durationMs).toFixed(2),
      },
      processObservations: {
        webBefore: beforeWeb,
        webAfter: afterWeb,
        workerBefore: beforeWorker,
        workerAfter: afterWorker,
        cpuDuringBurstSeconds: +(
          afterWeb.cpuSeconds -
          beforeWeb.cpuSeconds +
          afterWorker.cpuSeconds -
          beforeWorker.cpuSeconds
        ).toFixed(2),
        limit:
          "RSS observations before/after burst, not measured peak; process CPU excludes PostgreSQL/browser and is not whole-host utilization.",
      },
      transfers,
      media: {
        inputWidth: 600,
        inputHeight: 400,
        provenance: "CC0 Rachel Michetti / Pikolo Espresso Bar; scikit-image v0.25.2 coffee.png",
        inputBytes: image.length,
        distinctPhotographicAssets: 32,
        additionalPhotographProcessing: stats(photographicProcessingMs),
        uploadMs: +uploadMs.toFixed(2),
        workerReadyMs: +processingMs.toFixed(2),
        variants,
      },
      freshness: {
        canonicalWriteAndReadMs: +freshnessMs.toFixed(2),
        semantics:
          "Immediate indexed canonical reads; not asynchronous projection or CDN freshness.",
      },
      slices: {
        validatedRendering: true,
        boundedDiscovery: true,
        canonicalUpdate: true,
        foreignTenantDenied: attackDenied,
        asynchronousMedia: true,
        versionedManualPatch: true,
      },
      worker: (
        await pool.query(
          "SELECT count(*)::int AS pending,max(extract(epoch FROM now()-created_at))::double precision AS oldestPendingSeconds FROM jobs WHERE state='pending'",
        )
      ).rows[0],
      limits: [
        "Synthetic merchant/product data with a real CC0 coffee photograph; no merchant authenticity claim.",
        "Two independent compiled web replicas, sustained closed-loop mixed loads and emulated mobile/network profile; no production SLA or actual handset/network claim.",
        "English stemming only; typo/multilingual judgments remain future work.",
        "No live providers/CDN, production backup restore or approved retention policies.",
      ],
    };
    await writeFile("docs/evidence/X2-P11-BENCHMARK.json", JSON.stringify(report, null, 2) + "\n");
    console.log(
      JSON.stringify({
        phase: "complete",
        result: report.result,
        counts,
        searchP95Ms: searchStats.p95Ms,
        burstP95Ms: burstStats.p95Ms,
        workerReadyMs: report.media.workerReadyMs,
      }),
    );
    assert(passed, "Architecture experiment budget failed; inspect recorded report.");
  } finally {
    await browser?.close();
    await stop(web);
    await stop(worker);
    await pool?.end();
    if (created) {
      const deadline = Date.now() + 2000;
      while (
        (await parent.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1", [name])).rowCount &&
        Date.now() < deadline
      )
        await setTimeout(20);
      await parent.query(`DROP DATABASE IF EXISTS ${name}`);
    }
    await parent.end();
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch(async (error: unknown) => {
  let diagnosis =
    error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
      : "unknown_failure";
  for (const [key, value] of Object.entries(process.env))
    if (/KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL/i.test(key) && value && value.length >= 12)
      diagnosis = diagnosis.replaceAll(value, "[REDACTED]");
  if (process.env.DATABASE_URL)
    diagnosis = diagnosis.replaceAll(new URL(process.env.DATABASE_URL).password, "[REDACTED]");
  await writeFile(".local/p11-benchmark-error.txt", diagnosis + "\n");
  console.error(
    JSON.stringify({
      event: "benchmark.failed",
      reason: error instanceof CheckFailure ? error.message : undefined,
      code:
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "verification_failed",
    }),
  );
  process.exitCode = 1;
});
