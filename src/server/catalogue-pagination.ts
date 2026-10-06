import { createHash } from "node:crypto";
import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import { AccessError } from "./security/errors";
const cursor = z
  .object({
    v: z.literal(1),
    scope: z.string().regex(/^[a-f0-9]{24}$/),
    generation: z.string().regex(/^(0|[1-9][0-9]{0,18})$/),
    position: z.number().int().min(0).max(1000000),
    id: z.uuid(),
  })
  .strict();
function scope(shopId: string, departmentId: string) {
  return createHash("sha256").update(`${shopId}:${departmentId}`).digest("hex").slice(0, 24);
}
export async function catalogueGeneration(db: Pool | PoolClient, shopId: string): Promise<string> {
  return (
    (
      await db.query("SELECT generation::text FROM shop_catalogue_versions WHERE shop_id=$1", [
        shopId,
      ])
    ).rows[0]?.generation ?? "0"
  );
}
export function encodeCatalogueCursor(
  shopId: string,
  departmentId: string,
  generation: string,
  last: { position: number; id: string },
) {
  return Buffer.from(
    JSON.stringify(cursor.parse({ v: 1, scope: scope(shopId, departmentId), generation, ...last })),
  ).toString("base64url");
}
export function decodeCatalogueCursor(
  value: string,
  shopId: string,
  departmentId: string,
  generation: string,
) {
  try {
    if (!/^[A-Za-z0-9_-]{1,400}$/.test(value)) throw Error("invalid");
    const decoded = cursor.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (
      decoded.scope !== scope(shopId, departmentId) ||
      Buffer.from(JSON.stringify(decoded)).toString("base64url") !== value
    )
      throw Error("scope");
    if (decoded.generation !== generation) throw new AccessError(409, "catalogue_changed");
    return decoded;
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError(422, "invalid_catalogue_cursor");
  }
}
