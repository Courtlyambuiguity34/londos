import type { PoolClient } from "pg";
import { AccessError } from "./security/errors";

export function shopAddressBase(name: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70)
    .replace(/-$/g, "");
  return base.length >= 3 ? base : base ? `${base}-shop` : "shop";
}

// Called inside provisioning's transaction. Address history is the reservation
// authority; a former address must never be allocated to a different shop.
export async function availableShopAddress(client: PoolClient, name: string) {
  const base = shopAddressBase(name);
  // A global lock also covers overlapping bases (e.g. "bakery" and "bakery-2").
  // Manual address changes use the same lock after acquiring the merchant lock.
  await lockShopAddresses(client);
  const reserved = new Set(
    (
      await client.query("SELECT slug FROM shop_addresses WHERE slug=$1 OR slug LIKE $2", [
        base,
        `${base}-%`,
      ])
    ).rows.map((row: { slug: string }) => row.slug),
  );
  if (!reserved.has(base)) return base;
  for (let number = 2; number <= 10000; number++) {
    const candidate = `${base}-${number}`;
    if (!reserved.has(candidate)) return candidate;
  }
  throw new AccessError(409, "address_unavailable");
}

export async function lockShopAddresses(client: PoolClient) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shop-address-allocation',0))");
}
