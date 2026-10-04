import { createHash } from "node:crypto";
import { loadLocalEnv } from "./local-env";
import { database, transaction } from "../src/server/db/pool";
import { requireDevelopmentDatabase } from "../src/server/db/development";
loadLocalEnv();
const args = new Map<string, string>(
  process.argv.slice(2).map((arg) => {
    const split = arg.indexOf("=");
    if (split < 1) throw new Error("Arguments require --name=value.");
    return [arg.slice(0, split), arg.slice(split + 1)];
  }),
);
const shops = Number(args.get("--shops") ?? 1500),
  products = Number(args.get("--products") ?? 150000),
  seed = args.get("--seed") ?? "londos-scale-v1";
if (
  !Number.isInteger(shops) ||
  shops < 2 ||
  shops > 5000 ||
  !Number.isInteger(products) ||
  products < shops ||
  products > 200000 ||
  seed.length > 80
)
  throw new Error("Use --shops=2..5000 --products=shops..200000 --seed=bounded-string.");
function id(kind: string, index: number) {
  const hex = createHash("sha256").update(`${seed}:${kind}:${index}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const pool = database();
try {
  await requireDevelopmentDatabase(pool);
  await transaction(pool, async (client) => {
    await client.query(
      "INSERT INTO malls(id,name) VALUES($1,'Synthetic benchmark mall') ON CONFLICT DO NOTHING",
      [id("mall", 0)],
    );
    for (let index = 0; index < shops; index++) {
      await client.query("INSERT INTO merchants(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING", [
        id("merchant", index),
        `Synthetic merchant ${index}`,
      ]);
      await client.query(
        "INSERT INTO shops(id,merchant_id,mall_id,name,slug) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [
          id("shop", index),
          id("merchant", index),
          id("mall", 0),
          `Synthetic shop ${index}`,
          `synthetic-${id("shop", index)}`,
        ],
      );
      await client.query(
        "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position) VALUES($1,$2,$3,'Synthetic catalogue','catalogue',0) ON CONFLICT DO NOTHING",
        [id("department", index), id("shop", index), id("merchant", index)],
      );
      await client.query(
        "INSERT INTO shop_publication(shop_id,state) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [id("shop", index), index % 10 === 0 ? "unpublished" : "active"],
      );
      await client.query(
        "INSERT INTO tenancies(shop_id,state) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [id("shop", index), index % 17 === 0 ? "grace" : "active"],
      );
      await client.query(
        "INSERT INTO shop_moderation(shop_id,state) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [id("shop", index), index % 31 === 0 ? "suspended" : "clear"],
      );
    }
  });
  for (let start = 0; start < products; start += 500) {
    const rows = Array.from({ length: Math.min(500, products - start) }, (_, offset) => {
      const index = start + offset;
      // 40% of content goes to the hottest 10% of shops; the rest is distributed.
      const shop = index % 5 < 2 ? index % Math.max(1, Math.floor(shops / 10)) : index % shops;
      return {
        id: id("product", index),
        shop_id: id("shop", shop),
        merchant_id: id("merchant", shop),
        department_id: id("department", shop),
        name: `Synthetic ${["Shoes", "Dress", "Phone", "Repair service"][index % 4]} ${index % 200}`,
        slug: `synthetic-product-${index}`,
        kind: index % 4 === 3 ? "service" : "product",
        price_minor: String(5000 + (index % 100) * 1500),
        availability: index % 13 === 0 ? "unavailable" : "available",
      };
    });
    await pool.query(
      `INSERT INTO products(id,shop_id,merchant_id,department_id,name,slug,kind,currency,price_minor,availability)
      SELECT id,shop_id,merchant_id,department_id,name,slug,kind,'UGX',price_minor::numeric,availability FROM jsonb_to_recordset($1::jsonb)
      AS x(id uuid,shop_id uuid,merchant_id uuid,department_id uuid,name text,slug text,kind text,price_minor text,availability text) ON CONFLICT DO NOTHING`,
      [JSON.stringify(rows)],
    );
  }
  console.log(
    JSON.stringify({
      dataset: "synthetic",
      seed,
      requestedShops: shops,
      requestedProducts: products,
      repeat: "idempotent; existing rows preserved",
      performanceGate: "not measured by this generator",
    }),
  );
} finally {
  await pool.end();
}
