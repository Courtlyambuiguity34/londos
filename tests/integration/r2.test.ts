import { beforeAll, afterAll, test, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { generate } from "otplib";
import { migrate } from "../../src/server/db/migrate";
import { seed, seedIds, type SeedAccounts } from "../../src/server/db/seed";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { coreConfig } from "../../src/server/config";
import { createAuth, type Auth } from "../../src/server/security/auth";
import { resolveActor, type Actor } from "../../src/server/security/authorization";
import { enqueue } from "../../src/server/jobs/enqueue";
import { replay } from "../../src/server/jobs/queue";
import { readDesign } from "../../src/server/shop-design";
import { proposeDesign } from "../../src/server/ai-design/service";
import type { AIConfiguration } from "../../src/server/ai-design/config";
import type { DesignContext } from "../../src/modules/ai-design/contract";
const parentURL = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: parentURL }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool,
  auth: Auth,
  directory: string,
  accounts: SeedAccounts,
  owner: Actor,
  backupCodes: string[];
let clientNumber = 1;
class Client {
  readonly address = `127.0.0.${clientNumber++}`;
  cookies = new Map<string, string>();
  headers() {
    return new Headers({
      origin: coreConfig().baseURL,
      "x-londos-client-ip": this.address,
      "content-type": "application/json",
      cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    });
  }
  async post(path: string, body: unknown) {
    const r = await auth.handler(
      new Request(`${coreConfig().baseURL}/api/auth/${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      }),
    );
    for (const c of r.headers.getSetCookie()) {
      const first = c.split(";")[0]!,
        at = first.indexOf("=");
      this.cookies.set(first.slice(0, at), first.slice(at + 1));
    }
    return r;
  }
}
beforeAll(async () => {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  const url = new URL(parentURL);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  pool = new Pool({
    connectionString: url.toString(),
    max: 10,
    application_name: "londos-r2-review",
  });
  directory = await mkdtemp(join(tmpdir(), "londos-r2-"));
  await migrate(pool);
  auth = createAuth(pool, coreConfig(), true);
  accounts = await seed(pool, auth, directory);
  const a = new Client();
  expect((await a.post("sign-in/email", accounts.ownerA)).status).toBe(200);
  owner = await resolveActor(auth, a.headers());
  const op = new Client();
  expect((await op.post("sign-in/email", accounts.operator)).status).toBe(200);
  const enabled = await op.post("two-factor/enable", { password: accounts.operator.password });
  expect(enabled.status).toBe(200);
  const body = await enabled.json();
  backupCodes = body.backupCodes;
  const secret = new URL(body.totpURI).searchParams.get("secret")!;
  expect(
    (
      await op.post("two-factor/verify-totp", {
        code: await generate({ secret }),
        trustDevice: false,
      })
    ).status,
  ).toBe(200);
});
afterAll(async () => {
  await pool?.end();
  await parent.query(`DROP DATABASE IF EXISTS ${name}`);
  await parent.end();
  await rm(directory, { recursive: true, force: true });
  process.env.DATABASE_URL = parentURL;
});
async function operator() {
  const c = new Client();
  expect((await c.post("sign-in/email", accounts.operator)).status).toBe(200);
  expect(
    (
      await c.post("two-factor/verify-backup-code", {
        code: backupCodes.shift(),
        trustDevice: false,
      })
    ).status,
  ).toBe(200);
  return resolveActor(auth, c.headers());
}
async function deadJob() {
  const id = (await enqueue(pool, {
    kind: "notification.local",
    key: randomUUID(),
    merchantId: seedIds.merchantA,
    shopId: seedIds.shopA,
    payload: { template: "fictional-review" },
  }))!;
  await pool.query("UPDATE jobs SET state='dead',attempts=max_attempts WHERE id=$1", [id]);
  return id;
}
for (const change of ["grant", "session", "freshness"] as const) {
  test(`replay rechecks ${change} after an actual job-row lock wait`, async () => {
    const actor = await operator(),
      id = await deadJob(),
      blocker = await pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM jobs WHERE id=$1 FOR UPDATE", [id]);
      pending = replay(pool, actor, id).then(
        () => ({ accepted: true }),
        (error: unknown) => error,
      );
      const end = Date.now() + 3000;
      let blocked = false;
      while (Date.now() < end) {
        blocked = Boolean(
          (
            await pool.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='londos-r2-review' AND wait_event_type='Lock' AND query LIKE 'SELECT id,merchant_id FROM jobs%' ",
            )
          ).rowCount,
        );
        if (blocked) break;
        await setTimeout(10);
      }
      expect(blocked).toBe(true);
      if (change === "grant")
        await pool.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='jobs'", [
          actor.userId,
        ]);
      else if (change === "session")
        await pool.query("DELETE FROM session WHERE id=$1", [actor.sessionId]);
      else
        await pool.query(
          "UPDATE mfa_proofs SET verified_at=clock_timestamp()-interval '6 minutes' WHERE session_id=$1",
          [actor.sessionId],
        );
      await blocker.query("COMMIT");
      expect(await pending).toMatchObject({
        code:
          change === "session"
            ? "authentication_required"
            : change === "freshness"
              ? "fresh_authentication_required"
              : "permission_denied",
      });
      expect(
        (
          await pool.query(
            "SELECT state,attempts=max_attempts AS unchanged FROM jobs WHERE id=$1",
            [id],
          )
        ).rows[0],
      ).toEqual({ state: "dead", unchanged: true });
      expect(
        (
          await pool.query(
            "SELECT 1 FROM audit_events WHERE action='job.replayed' AND resource_id=$1",
            [id],
          )
        ).rowCount,
      ).toBe(0);
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      await pending;
      if (change === "grant")
        await pool.query(
          "INSERT INTO operator_grants(user_id,permission)VALUES($1,'jobs') ON CONFLICT DO NOTHING",
          [actor.userId],
        );
    }
  });
}
test("fresh native-MFA replay still resets exactly one dead job and appends one audit", async () => {
  const actor = await operator(),
    id = await deadJob();
  await replay(pool, actor, id);
  expect((await pool.query("SELECT state,attempts FROM jobs WHERE id=$1", [id])).rows[0]).toEqual({
    state: "pending",
    attempts: 0,
  });
  expect(
    (
      await pool.query(
        "SELECT 1 FROM audit_events WHERE action='job.replayed' AND resource_id=$1",
        [id],
      )
    ).rowCount,
  ).toBe(1);
});
async function archivedFirstCatalogue() {
  const shop = randomUUID(),
    old = randomUUID(),
    active = randomUUID(),
    product = randomUUID();
  await pool.query(
    "INSERT INTO shops(id,merchant_id,mall_id,name,slug,category)VALUES($1,$2,$3,'R2 fictional shop',$4,'fashion')",
    [shop, seedIds.merchantA, seedIds.mallA, `r2-${shop}`],
  );
  await pool.query(
    "INSERT INTO departments(id,shop_id,merchant_id,name,slug,archived,position)VALUES($1,$2,$3,'Old','old',true,0),($4,$2,$3,'Current','current',false,1)",
    [old, shop, seedIds.merchantA, active],
  );
  await pool.query(
    "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,price_minor,availability,position) SELECT gen_random_uuid(),$1,$2,$3,'product','Old item '||i,'old-'||i,'UGX',1000,'available',i FROM generate_series(0,31) g(i)",
    [shop, seedIds.merchantA, old],
  );
  await pool.query(
    "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,price_minor,availability,position)VALUES($1,$2,$3,$4,'product','Current item','current','UGX',1000,'available',100)",
    [product, shop, seedIds.merchantA, active],
  );
  return { shop, product };
}
test("manual design takes its bounded choices from active departments before limiting", async () => {
  const { shop, product } = await archivedFirstCatalogue(),
    design = await readDesign(pool, owner, shop);
  expect(design.products.map((p) => p.id)).toEqual([product]);
});
test("AI minimum context includes eligible choices beyond an archived department's first 32 rows", async () => {
  const { shop, product } = await archivedFirstCatalogue();
  let seen: DesignContext | undefined;
  const config: AIConfiguration = {
    remote: true,
    providers: {
      gemini: {
        model: "gemini-fixture",
        keys: ["SAFE_R2_GEMINI_SENTINEL"],
        inputRate: 1n,
        outputRate: 1n,
      },
    },
    status: { gemini: "configured_unverified", openai: "remote_disabled" },
    fallback: false,
    authFailover: false,
    dailyCostMicroUsd: 1000000n,
  };
  const result = await proposeDesign(
    pool,
    owner,
    shop,
    {
      key: randomUUID(),
      version: 0,
      instruction: "Improve the shop for customers",
      externalConsent: true,
      qualityReview: false,
    },
    {
      config,
      providers: {
        gemini: {
          kind: "gemini",
          model: "gemini-fixture",
          verification: "fixture",
          generate: async (input) => {
            seen = input.context;
            return {
              text: JSON.stringify({
                patches: [{ op: "theme", theme: "plum" }],
                confidence: "high",
                review: "not_needed",
              }),
              usage: { inputTokens: 100, outputTokens: 50 },
            };
          },
        },
      },
    },
  );
  expect(result.status).toBe("proposed");
  expect(seen!.products.map((p) => p.id)).toEqual([product]);
});
