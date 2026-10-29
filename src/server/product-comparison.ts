import type { Pool } from "pg";
import { comparisonIds } from "../modules/discovery/comparison";
import { eligibilityJoins, eligibleStates } from "./public-eligibility";

export type ComparisonProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  kind: string;
  price_minor: string | null;
  currency: string;
  availability: string;
  shop_id: string;
  shop_name: string;
  shop_slug: string;
  department_name: string;
  fulfilment: string;
};
// Browser selections are never authority for product visibility or current prices.
export async function readComparison(pool: Pool, input: string[]) {
  const ids = comparisonIds.parse(input);
  if (!ids.length) return [];
  const rows = (
    await pool.query<ComparisonProduct>(
      `SELECT q.id,q.name,q.slug,q.description,q.kind,q.price_minor::text,q.currency,q.availability,
       s.id AS shop_id,s.name AS shop_name,s.slug AS shop_slug,d.name AS department_name,coalesce(c.fulfilment,'contact') AS fulfilment
     FROM products q JOIN shops s ON s.id=q.shop_id
     JOIN departments d ON d.id=q.department_id AND d.shop_id=s.id AND d.archived=false
     ${eligibilityJoins} JOIN shop_designs sd ON sd.shop_id=s.id AND sd.published_id IS NOT NULL
     LEFT JOIN shop_contacts c ON c.shop_id=s.id
     WHERE q.id=ANY($1::uuid[]) AND q.availability<>'archived' AND ${eligibleStates}
     ORDER BY array_position($1::uuid[],q.id) LIMIT 4`,
      [ids],
    )
  ).rows;
  return rows;
}
