import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  shopSpecification,
  patchSpecification,
  specificationPatch,
  type ShopSpecification,
} from "../modules/shop-design/specification";
import { transaction } from "./db/pool";
import { requireShop, requireStepUp, type Actor } from "./security/authorization";
import { AccessError } from "./security/errors";
import { audit } from "./security/audit";

export const saveDesignInput = z
  .object({
    version: z.number().int().min(0),
    summary: z.string().trim().min(1).max(500),
    specification: shopSpecification,
  })
  .strict();
export const publishDesignInput = z
  .object({
    version: z.number().int().positive(),
    revision: z.number().int().positive(),
    confirm: z.literal(true),
  })
  .strict();
export const patchDesignInput = z
  .object({ version: z.number().int().positive(), patch: specificationPatch })
  .strict();
export const rollbackDesignInput = z
  .object({
    version: z.number().int().positive(),
    revision: z.number().int().positive(),
    summary: z.string().trim().min(1).max(500),
  })
  .strict();
export const unpublishDesignInput = z
  .object({ version: z.number().int().positive(), confirm: z.literal(true) })
  .strict();

export async function designLock(
  client: PoolClient,
  actor: Actor,
  shopId: string,
  permission: "design" | "publish",
) {
  const shop = await requireShop(client, actor, shopId, permission);
  await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [shop.merchant_id]);
  await requireShop(client, actor, shopId, permission);
  if (permission === "publish") await requireStepUp(client, actor);
  return shop;
}
export async function validateReferences(
  client: PoolClient,
  shopId: string,
  spec: ShopSpecification,
) {
  const departments = spec.spaces.flatMap((space) =>
    space.type === "department" ? [space.departmentId] : [],
  );
  const products = spec.spaces.flatMap((space) =>
    space.type === "products" ? space.productIds : [],
  );
  const validDepartments = (
    await client.query(
      "SELECT id FROM departments WHERE shop_id=$1 AND archived=false AND id=ANY($2::uuid[])",
      [shopId, departments],
    )
  ).rows;
  const validProducts = (
    await client.query(
      "SELECT p.id FROM products p JOIN departments d ON d.id=p.department_id WHERE p.shop_id=$1 AND p.availability<>'archived' AND d.archived=false AND p.id=ANY($2::uuid[])",
      [shopId, products],
    )
  ).rows;
  if (
    validDepartments.length !== new Set(departments).size ||
    validProducts.length !== new Set(products).size
  )
    throw new AccessError(404, "resource_unavailable");
}
export async function state(client: PoolClient, shopId: string, merchantId: string) {
  await client.query(
    "INSERT INTO shop_designs(shop_id,merchant_id,last_revision) SELECT $1,$2,coalesce(max(revision),0) FROM shop_revisions WHERE shop_id=$1 ON CONFLICT DO NOTHING",
    [shopId, merchantId],
  );
  return (await client.query("SELECT * FROM shop_designs WHERE shop_id=$1", [shopId])).rows[0] as {
    version: number;
    last_revision: number;
    draft_id: string | null;
    published_id: string | null;
  };
}
export async function insertRevision(
  client: PoolClient,
  actor: Actor,
  shopId: string,
  merchantId: string,
  current: Awaited<ReturnType<typeof state>>,
  spec: ShopSpecification,
  summary: string,
) {
  await validateReferences(client, shopId, spec);
  const id = randomUUID(),
    revision = current.last_revision + 1;
  await client.query(
    "INSERT INTO shop_revisions(id,shop_id,merchant_id,revision,schema_version,design,author_id,summary,parent_id) VALUES($1,$2,$3,$4,1,$5,$6,$7,$8)",
    [
      id,
      shopId,
      merchantId,
      revision,
      JSON.stringify(spec),
      actor.userId,
      summary,
      current.draft_id,
    ],
  );
  await client.query(
    "UPDATE shop_designs SET draft_id=$2,last_revision=$3,version=version+1 WHERE shop_id=$1",
    [shopId, id, revision],
  );
  await audit(client, actor, "shop.design.saved", id, merchantId, {
    revision,
    version: current.version + 1,
    summary,
  });
  return { version: current.version + 1, revision };
}
export async function readDesign(pool: Pool | PoolClient, actor: Actor, shopId: string) {
  await requireShop(pool, actor, shopId, "design");
  const pointer = (
    await pool.query(
      "SELECT d.version,r.revision,r.design,p.revision AS published_revision FROM shop_designs d LEFT JOIN shop_revisions r ON r.id=d.draft_id LEFT JOIN shop_revisions p ON p.id=d.published_id WHERE d.shop_id=$1",
      [shopId],
    )
  ).rows[0] as
    | {
        version: number;
        revision: number | null;
        design: unknown;
        published_revision: number | null;
      }
    | undefined;
  const history = (
    await pool.query(
      "SELECT revision,summary,created_at FROM shop_revisions WHERE shop_id=$1 ORDER BY revision DESC LIMIT 20",
      [shopId],
    )
  ).rows as { revision: number; summary: string; created_at: Date }[];
  const departments = (
    await pool.query(
      "SELECT id,name,slug FROM departments WHERE shop_id=$1 AND archived=false ORDER BY position,id LIMIT 100",
      [shopId],
    )
  ).rows as { id: string; name: string; slug: string }[];
  const fallback: ShopSpecification = {
    schemaVersion: 1,
    theme: "earth",
    announcement: "",
    spaces: departments.slice(0, 4).map((d, i) => ({
      id: `department-${i}`,
      type: "department",
      version: 1,
      departmentId: d.id,
      limit: 8,
    })),
    actions: ["call", "whatsapp", "enquiry"],
  };
  return {
    version: pointer?.version ?? 0,
    revision: pointer?.revision ?? null,
    publishedRevision: pointer?.published_revision ?? null,
    specification: shopSpecification.safeParse(pointer?.design).data ?? fallback,
    history,
    departments,
  };
}
export async function saveDesign(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: z.infer<typeof saveDesignInput>,
) {
  const value = saveDesignInput.parse(input);
  return transaction(pool, async (client) => {
    const shop = await designLock(client, actor, shopId, "design"),
      current = await state(client, shopId, shop.merchant_id);
    if (current.version !== value.version) throw new AccessError(409, "stale_version");
    return insertRevision(
      client,
      actor,
      shopId,
      shop.merchant_id,
      current,
      value.specification,
      value.summary,
    );
  });
}
export async function patchDesign(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: z.infer<typeof patchDesignInput>,
) {
  const value = patchDesignInput.parse(input);
  return transaction(pool, async (client) => {
    const shop = await designLock(client, actor, shopId, "design"),
      current = await state(client, shopId, shop.merchant_id);
    if (current.version !== value.version) throw new AccessError(409, "stale_version");
    const prior = (
      await client.query("SELECT design FROM shop_revisions WHERE id=$1 AND shop_id=$2", [
        current.draft_id,
        shopId,
      ])
    ).rows[0];
    if (!prior) throw new AccessError(404, "resource_unavailable");
    let next: ShopSpecification;
    try {
      next = patchSpecification(prior.design, value.patch);
    } catch {
      throw new AccessError(422, "invalid_patch");
    }
    return insertRevision(
      client,
      actor,
      shopId,
      shop.merchant_id,
      current,
      next,
      `Manual ${value.patch.op} change`,
    );
  });
}
export async function rollbackDesign(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: z.infer<typeof rollbackDesignInput>,
) {
  const value = rollbackDesignInput.parse(input);
  return transaction(pool, async (client) => {
    const shop = await designLock(client, actor, shopId, "design"),
      current = await state(client, shopId, shop.merchant_id);
    if (current.version !== value.version) throw new AccessError(409, "stale_version");
    const prior = (
      await client.query("SELECT design FROM shop_revisions WHERE shop_id=$1 AND revision=$2", [
        shopId,
        value.revision,
      ])
    ).rows[0];
    if (!prior) throw new AccessError(404, "resource_unavailable");
    return insertRevision(
      client,
      actor,
      shopId,
      shop.merchant_id,
      current,
      shopSpecification.parse(prior.design),
      value.summary,
    );
  });
}
export async function publishDesign(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: z.infer<typeof publishDesignInput>,
) {
  const value = publishDesignInput.parse(input);
  return transaction(pool, async (client) => {
    const shop = await designLock(client, actor, shopId, "publish"),
      current = await state(client, shopId, shop.merchant_id);
    if (current.version !== value.version) throw new AccessError(409, "stale_version");
    const draft = (
      await client.query("SELECT revision,design FROM shop_revisions WHERE id=$1 AND shop_id=$2", [
        current.draft_id,
        shopId,
      ])
    ).rows[0];
    if (!draft || draft.revision !== value.revision) throw new AccessError(409, "stale_version");
    await validateReferences(client, shopId, shopSpecification.parse(draft.design));
    const allowed = await client.query(
      "SELECT 1 FROM tenancies t JOIN shop_moderation m ON m.shop_id=t.shop_id JOIN shop_publication p ON p.shop_id=t.shop_id WHERE t.shop_id=$1 AND t.state IN ('active','due','grace') AND m.state='clear' AND p.state NOT IN ('archived','provisioning') FOR UPDATE OF t,m,p",
      [shopId],
    );
    if (!allowed.rowCount) throw new AccessError(409, "shop_not_eligible");
    await client.query(
      "UPDATE shop_designs SET published_id=draft_id,version=version+1 WHERE shop_id=$1",
      [shopId],
    );
    await client.query(
      "UPDATE shop_publication SET state='active',version=version+1 WHERE shop_id=$1",
      [shopId],
    );
    await audit(client, actor, "shop.design.published", current.draft_id!, shop.merchant_id, {
      revision: value.revision,
      version: current.version + 1,
    });
    return { version: current.version + 1, revision: value.revision };
  });
}
export async function unpublishDesign(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: z.infer<typeof unpublishDesignInput>,
) {
  const value = unpublishDesignInput.parse(input);
  return transaction(pool, async (client) => {
    const shop = await designLock(client, actor, shopId, "publish"),
      current = await state(client, shopId, shop.merchant_id);
    if (current.version !== value.version) throw new AccessError(409, "stale_version");
    await client.query("UPDATE shop_designs SET version=version+1 WHERE shop_id=$1", [shopId]);
    await client.query(
      "UPDATE shop_publication SET state='unpublished',version=version+1 WHERE shop_id=$1 AND state<>'archived'",
      [shopId],
    );
    await audit(client, actor, "shop.design.unpublished", shopId, shop.merchant_id, {
      version: current.version + 1,
    });
    return { version: current.version + 1 };
  });
}
