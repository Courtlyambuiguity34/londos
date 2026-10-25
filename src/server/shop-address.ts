import type { PoolClient } from "pg";
import { AccessError } from "./security/errors";
import { shopAddressInput } from "../modules/shop-address";

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
export async function availableShopAddress(client: PoolClient, name: string, preferred?: string) {
  const base = shopAddressInput.parse(preferred ?? shopAddressBase(name));
  // A global lock covers both automatic names and explicitly selected addresses.
  // Manual address changes use the same lock after acquiring the merchant lock.
  await lockShopAddresses(client);
  if ((await client.query("SELECT 1 FROM shop_addresses WHERE slug=$1", [base])).rowCount)
    throw new AccessError(409, "address_unavailable");
  return base;
}

export async function lockShopAddresses(client: PoolClient) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shop-address-allocation',0))");
}
