import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "./db/pool";
import { catalogueAccess, catalogueLock } from "./catalogue";
import { requireShop, type Actor } from "./security/authorization";
import { AccessError } from "./security/errors";
import { audit } from "./security/audit";
import { enqueue } from "./jobs/enqueue";
import type { Job } from "./jobs/queue";

export const maximumUpload = 4 * 1024 * 1024;
export const mediaReservation = 20 * 1024 * 1024;
export const uploadInput = z
  .object({
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    bytes: z.number().int().min(1).max(maximumUpload),
    alt: z.string().trim().min(1).max(240),
  })
  .strict();
export const mediaVersion = z.object({ version: z.number().int().positive() }).strict();
export async function listMedia(pool: Pool, actor: Actor, shopId: string) {
  await catalogueAccess(pool, actor, shopId, "catalogue", "support");
  return (
    await pool.query(
      `SELECT a.id,CASE WHEN a.state='processing' AND EXISTS(SELECT 1 FROM jobs j WHERE j.kind='media.process' AND j.shop_id=a.shop_id AND j.payload->>'assetId'=a.id::text AND j.payload->>'version'=a.version::text AND j.state='dead') THEN 'failed' ELSE a.state END AS state,a.version,a.alt,a.width,a.height,a.error_code,a.byte_count FROM media_assets a WHERE a.shop_id=$1 AND a.created_by IS NOT NULL AND a.state<>'deleted' ORDER BY a.id LIMIT 100`,
      [shopId],
    )
  ).rows;
}
export async function startUpload(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: z.infer<typeof uploadInput>,
) {
  const v = uploadInput.parse(input);
  return transaction(pool, async (client) => {
    const shop = await catalogueLock(client, actor, shopId);
    await client.query("INSERT INTO media_quotas(shop_id) VALUES($1) ON CONFLICT DO NOTHING", [
      shopId,
    ]);
    const reserved = await client.query(
      "UPDATE media_quotas SET asset_count=asset_count+1,reserved_bytes=reserved_bytes+$2 WHERE shop_id=$1 AND asset_count<100 AND stored_bytes+reserved_bytes+$2<=134217728 RETURNING shop_id",
      [shopId, mediaReservation],
    );
    if (!reserved.rowCount) throw new AccessError(422, "media_quota_exceeded");
    const id = randomUUID();
    const row = await client.query(
      "INSERT INTO media_assets(id,shop_id,merchant_id,state,storage_key,created_by,expires_at,content_type,declared_bytes,alt,reserved_bytes) VALUES($1::uuid,$2,$3,'uploaded',$1::uuid::text,$4,clock_timestamp()+interval '15 minutes',$5,$6,$7,$8) RETURNING id,version,expires_at",
      [id, shopId, shop.merchant_id, actor.userId, v.contentType, v.bytes, v.alt, mediaReservation],
    );
    await audit(client, actor, "media.upload.started", id, shop.merchant_id);
    return row.rows[0];
  });
}
export async function uploadAuthority(pool: Pool, actor: Actor, shopId: string, id: string) {
  await catalogueAccess(pool, actor, shopId);
  const row = (
    await pool.query(
      "SELECT declared_bytes,content_type FROM media_assets WHERE id=$1 AND shop_id=$2 AND created_by=$3 AND state='uploaded' AND expires_at>clock_timestamp()",
      [id, shopId, actor.userId],
    )
  ).rows[0];
  if (!row) throw new AccessError(404, "resource_unavailable");
  return row as { declared_bytes: number; content_type: string };
}
export async function finishUpload(
  pool: Pool,
  actor: Actor,
  shopId: string,
  id: string,
  bytes: Buffer,
  contentType: string,
) {
  return transaction(pool, async (client) => {
    const shop = await catalogueLock(client, actor, shopId);
    const row = (
      await client.query(
        "SELECT declared_bytes,content_type FROM media_assets WHERE id=$1 AND shop_id=$2 AND created_by=$3 AND state='uploaded' AND expires_at>clock_timestamp() FOR UPDATE",
        [id, shopId, actor.userId],
      )
    ).rows[0];
    if (!row) throw new AccessError(404, "resource_unavailable");
    if (
      bytes.length !== row.declared_bytes ||
      bytes.length > maximumUpload ||
      contentType !== row.content_type
    )
      throw new AccessError(422, "upload_size_or_type_mismatch");
    await client.query(
      "INSERT INTO media_blobs(asset_id,variant,bytes) VALUES($1,'quarantine',$2)",
      [id, bytes],
    );
    const updated = await client.query(
      "UPDATE media_assets SET state='processing',version=version+1,byte_count=$2,reserved_bytes=reserved_bytes-$2 WHERE id=$1 RETURNING id,version,state",
      [id, bytes.length],
    );
    await client.query(
      "UPDATE media_quotas SET stored_bytes=stored_bytes+$2,reserved_bytes=reserved_bytes-$2 WHERE shop_id=$1",
      [shopId, bytes.length],
    );
    await enqueue(client, {
      kind: "media.process",
      key: `media:${id}:${updated.rows[0].version}`,
      merchantId: shop.merchant_id,
      shopId,
      payload: { assetId: id, version: updated.rows[0].version },
    });
    await audit(client, actor, "media.upload.queued", id, shop.merchant_id);
    return updated.rows[0];
  });
}
export async function deleteMedia(
  pool: Pool,
  actor: Actor,
  shopId: string,
  id: string,
  version: number,
) {
  z.number().int().positive().parse(version);
  return transaction(pool, async (client) => {
    const shop = await catalogueLock(client, actor, shopId);
    const asset = (
      await client.query(
        "SELECT version,state,byte_count,reserved_bytes FROM media_assets WHERE id=$1 AND shop_id=$2 AND created_by IS NOT NULL FOR UPDATE",
        [id, shopId],
      )
    ).rows[0];
    if (!asset || asset.state === "deleted") throw new AccessError(404, "resource_unavailable");
    if (asset.version !== version) throw new AccessError(409, "stale_version");
    if (
      (await client.query("SELECT 1 FROM product_media WHERE asset_id=$1 LIMIT 1", [id]))
        .rowCount ||
      (
        await client.query(
          `SELECT 1 FROM shop_designs d JOIN shop_revisions r ON r.id IN (d.draft_id,d.published_id)
         WHERE d.shop_id=$1 AND (r.design->'branding'->>'coverAssetId'=$2 OR r.design->'branding'->>'logoAssetId'=$2) LIMIT 1`,
          [shopId, id],
        )
      ).rowCount
    )
      throw new AccessError(409, "media_in_use");
    await purgeAsset(client, id, shopId, asset.byte_count, asset.reserved_bytes);
    await audit(client, actor, "media.deleted", id, shop.merchant_id);
    return { deleted: true };
  });
}
async function purgeAsset(
  client: PoolClient,
  id: string,
  shopId: string,
  bytes: string,
  reserved: string,
) {
  await client.query("DELETE FROM media_blobs WHERE asset_id=$1", [id]);
  await client.query(
    "UPDATE media_assets SET state='deleted',version=version+1,byte_count=0,reserved_bytes=0 WHERE id=$1",
    [id],
  );
  await client.query(
    "UPDATE media_quotas SET asset_count=asset_count-1,stored_bytes=stored_bytes-$2,reserved_bytes=reserved_bytes-$3 WHERE shop_id=$1",
    [shopId, bytes, reserved],
  );
}
export async function retryMedia(
  pool: Pool,
  actor: Actor,
  shopId: string,
  id: string,
  version: number,
) {
  z.number().int().positive().parse(version);
  return transaction(pool, async (client) => {
    const shop = await catalogueLock(client, actor, shopId);
    const asset = (
      await client.query(
        "SELECT version,state FROM media_assets WHERE id=$1 AND shop_id=$2 FOR UPDATE",
        [id, shopId],
      )
    ).rows[0];
    if (!asset) throw new AccessError(404, "resource_unavailable");
    if (asset.version !== version) throw new AccessError(409, "stale_version");
    if (
      !["failed", "processing"].includes(asset.state) ||
      !(
        await client.query(
          "SELECT 1 FROM jobs WHERE kind='media.process' AND shop_id=$1 AND payload->>'assetId'=$2 AND payload->>'version'=$3 AND state='dead'",
          [shopId, id, String(version)],
        )
      ).rowCount
    )
      throw new AccessError(409, "media_not_retryable");
    const updated = await client.query(
      "UPDATE media_assets SET state='processing',version=version+1,error_code=NULL WHERE id=$1 RETURNING id,version",
      [id],
    );
    await enqueue(client, {
      kind: "media.process",
      key: `media:${id}:${updated.rows[0].version}`,
      merchantId: shop.merchant_id,
      shopId,
      payload: { assetId: id, version: updated.rows[0].version },
    });
    await audit(client, actor, "media.retry", id, shop.merchant_id);
    return updated.rows[0];
  });
}
export const displayVariant = z.enum(["thumbnail", "card", "display"]);
export async function readVariant(
  pool: Pool,
  actor: Actor,
  shopId: string,
  id: string,
  variant: z.infer<typeof displayVariant>,
) {
  try {
    await catalogueAccess(pool, actor, shopId, "catalogue", "support");
  } catch (error) {
    if (!(error instanceof AccessError) || error.status !== 404) throw error;
    await requireShop(pool, actor, shopId, "design");
  }
  const row = (
    await pool.query(
      "SELECT b.bytes FROM media_blobs b JOIN media_assets a ON a.id=b.asset_id WHERE a.id=$1 AND a.shop_id=$2 AND a.state='ready' AND b.variant=$3",
      [id, shopId, displayVariant.parse(variant)],
    )
  ).rows[0];
  if (!row) throw new AccessError(404, "resource_unavailable");
  return row.bytes as Buffer;
}

class UnsafeImage extends Error {
  constructor() {
    super("image_rejected");
  }
}
function checkContainer(bytes: Buffer, type: string) {
  if (type === "image/png") {
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw new UnsafeImage();
    let offset = 8,
      ended = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset),
        kind = bytes.toString("ascii", offset + 4, offset + 8);
      offset += length + 12;
      if (offset > bytes.length) throw new UnsafeImage();
      if (kind === "IEND") {
        ended = length === 0;
        break;
      }
    }
    if (!ended || offset !== bytes.length) throw new UnsafeImage();
  } else if (type === "image/jpeg") {
    if (
      !bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
      !bytes.subarray(-2).equals(Buffer.from([255, 217]))
    )
      throw new UnsafeImage();
  } else if (type === "image/webp") {
    if (
      bytes.length < 12 ||
      bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WEBP" ||
      bytes.readUInt32LE(4) + 8 !== bytes.length
    )
      throw new UnsafeImage();
  } else throw new UnsafeImage();
}
export async function imageVariants(bytes: Buffer, type: string, signal: AbortSignal) {
  signal.throwIfAborted();
  if (bytes.length > maximumUpload) throw new UnsafeImage();
  checkContainer(bytes, type);
  const sharp = (await import("sharp")).default;
  sharp.cache(false);
  const options = { limitInputPixels: 16000000, failOn: "warning" as const, animated: false };
  try {
    const metadata = await sharp(bytes, options).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 8192 ||
      metadata.height > 8192 ||
      (metadata.pages ?? 1) !== 1
    )
      throw new UnsafeImage();
    const variants = [];
    for (const [variant, size] of [
      ["thumbnail", 320],
      ["card", 640],
      ["display", 1280],
      ["source", 2048],
    ] as const) {
      signal.throwIfAborted();
      const output = await sharp(bytes, options)
        .rotate()
        .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
        .webp({ quality: variant === "source" ? 90 : 80 })
        .toBuffer({ resolveWithObject: true });
      variants.push({
        variant,
        bytes: output.data,
        width: output.info.width,
        height: output.info.height,
      });
    }
    if (variants.reduce((sum, v) => sum + v.bytes.length, 0) > mediaReservation)
      throw new UnsafeImage();
    signal.throwIfAborted();
    return variants;
  } catch (error) {
    if (signal.aborted) throw error;
    throw new UnsafeImage();
  }
}
export async function processMedia(pool: Pool, job: Job, signal: AbortSignal) {
  const payload = z
    .object({ assetId: z.uuid(), version: z.number().int().positive() })
    .strict()
    .parse(job.payload);
  if (!job.shop_id || !job.merchant_id) throw new Error("unsupported_job");
  const source = (
    await pool.query(
      "SELECT a.content_type,b.bytes FROM media_assets a JOIN media_blobs b ON b.asset_id=a.id AND b.variant='quarantine' WHERE a.id=$1 AND a.shop_id=$2 AND a.merchant_id=$3 AND a.version=$4 AND a.state='processing'",
      [payload.assetId, job.shop_id, job.merchant_id, payload.version],
    )
  ).rows[0];
  if (!source) return;
  let variants: Awaited<ReturnType<typeof imageVariants>> | undefined;
  try {
    variants = await imageVariants(source.bytes, source.content_type, signal);
  } catch (error) {
    if (!(error instanceof UnsafeImage)) throw error;
  }
  await transaction(pool, async (client) => {
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [job.merchant_id]);
    const fence = await client.query(
      "SELECT 1 FROM jobs WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>clock_timestamp() FOR UPDATE",
      [job.id, job.lease_token],
    );
    if (!fence.rowCount) throw new Error("lease_lost");
    const asset = (
      await client.query(
        "SELECT byte_count,reserved_bytes FROM media_assets WHERE id=$1 AND shop_id=$2 AND merchant_id=$3 AND version=$4 AND state='processing' FOR UPDATE",
        [payload.assetId, job.shop_id, job.merchant_id, payload.version],
      )
    ).rows[0];
    if (!asset) return;
    if (
      !(
        await client.query(
          "INSERT INTO job_effects(job_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING job_id",
          [job.id],
        )
      ).rowCount
    )
      return;
    await client.query("DELETE FROM media_blobs WHERE asset_id=$1", [payload.assetId]);
    let total = 0;
    if (variants)
      for (const v of variants) {
        total += v.bytes.length;
        await client.query(
          "INSERT INTO media_blobs(asset_id,variant,bytes,width,height) VALUES($1,$2,$3,$4,$5)",
          [payload.assetId, v.variant, v.bytes, v.width, v.height],
        );
      }
    const full = variants?.at(-1);
    await client.query(
      "UPDATE media_assets SET state=$2,byte_count=$3,reserved_bytes=0,width=$4,height=$5,error_code=$6 WHERE id=$1",
      [
        payload.assetId,
        variants ? "ready" : "rejected",
        total,
        full?.width ?? null,
        full?.height ?? null,
        variants ? null : "image_rejected",
      ],
    );
    await client.query(
      "UPDATE media_quotas SET stored_bytes=stored_bytes-$2+$3,reserved_bytes=reserved_bytes-$4 WHERE shop_id=$1",
      [job.shop_id, asset.byte_count, total, asset.reserved_bytes],
    );
    signal.throwIfAborted();
  });
}
export async function cleanupMedia(client: PoolClient) {
  const candidates = (
    await client.query(
      "SELECT DISTINCT merchant_id FROM media_assets WHERE state='uploaded' AND created_by IS NOT NULL AND expires_at<clock_timestamp() ORDER BY merchant_id LIMIT 20",
    )
  ).rows;
  for (const candidate of candidates) {
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [candidate.merchant_id]);
    const assets = (
      await client.query(
        "SELECT id,shop_id,byte_count,reserved_bytes FROM media_assets WHERE merchant_id=$1 AND state='uploaded' AND created_by IS NOT NULL AND expires_at<clock_timestamp() ORDER BY id LIMIT 100 FOR UPDATE",
        [candidate.merchant_id],
      )
    ).rows;
    for (const asset of assets)
      await purgeAsset(client, asset.id, asset.shop_id, asset.byte_count, asset.reserved_bytes);
  }
}
