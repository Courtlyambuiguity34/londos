import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "./db/pool";
import { eligibilityJoins, eligibleStates } from "./public-eligibility";
import { AccessError } from "./security/errors";
import { savedShopIds } from "../modules/discovery/saved-contract";
import { listingKind, listingAvailability } from "../modules/discovery/refinements";
import { priceRangeFields, priceMinor, validatePriceRange } from "../modules/discovery/price-range";

export const categorySlug = z.enum([
  "fashion",
  "electronics",
  "beauty",
  "food",
  "home",
  "services",
  "other",
]);
export const searchInput = z
  .object({
    query: z
      .string()
      .trim()
      .max(80)
      .refine(
        (q) =>
          ![...q].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) &&
          q.split(/\s+/).length <= 8,
      ),
    category: categorySlug.optional(),
    shopId: z.uuid().optional(),
    shopIds: savedShopIds.optional(),
    kind: listingKind.default("all"),
    availability: listingAvailability.default("all"),
    ...priceRangeFields,
    cursor: z.string().max(400).optional(),
    limit: z.number().int().min(1).max(20).default(20),
  })
  .strict()
  .superRefine(validatePriceRange);
const cursorInput = z
  .object({
    v: z.literal(1),
    scope: z.string().length(24),
    score: z.number().finite(),
    id: z.uuid(),
  })
  .strict();
export type DiscoveryResult = {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  category: string;
  context: string | null;
  department_slug: string | null;
  product_slug: string | null;
  image?: { id: string; alt: string; width: number; height: number } | null;
  match?: {
    id: string;
    name: string;
    kind: "product" | "service";
    price_minor: string | null;
    currency: string;
    availability: string;
  } | null;
};
export interface SearchService {
  search(
    input: z.input<typeof searchInput>,
  ): Promise<{ results: DiscoveryResult[]; nextCursor: string | null; query: string }>;
}
// Indexed canonical reads are the initial SearchService implementation. No
// asynchronous projection is trusted for visibility, names, prices or contacts.
export class PostgresSearch implements SearchService {
  constructor(private readonly pool: Pool) {}
  async search(input: z.input<typeof searchInput>) {
    const value = searchInput.parse(input),
      minMinor = priceMinor(value.minPrice, value.currency),
      maxMinor = priceMinor(value.maxPrice, value.currency),
      budget = minMinor !== null || maxMinor !== null,
      scope = createHash("sha256")
        .update(
          JSON.stringify([
            value.query.toLowerCase(),
            value.category ?? null,
            value.shopId ?? null,
            ...(value.shopIds ? [[...value.shopIds].sort()] : []),
            ...(value.kind !== "all" || value.availability !== "all"
              ? [{ kind: value.kind, availability: value.availability }]
              : []),
            ...(budget ? [{ currency: value.currency, minMinor, maxMinor }] : []),
          ]),
        )
        .digest("hex")
        .slice(0, 24);
    let cursor: z.infer<typeof cursorInput> | null = null;
    if (value.cursor) {
      try {
        cursor = cursorInput.parse(
          JSON.parse(Buffer.from(value.cursor, "base64url").toString("utf8")),
        );
        if (cursor.scope !== scope) throw Error("scope");
      } catch {
        throw new AccessError(422, "invalid_cursor");
      }
    }
    const refined = value.kind !== "all" || value.availability !== "all" || budget;
    // Fixed SQL fragments use only bound values. No browser-side filtering of
    // an already paginated result: every eligible hit satisfies the scope.
    const listingFilter = (alias: string) =>
      `($8::text='all' OR ${alias}.kind=$8) AND ($9::text='all' OR ${alias}.availability=$9) AND ($10::text IS NULL OR (${alias}.currency=$10 AND ${alias}.price_minor IS NOT NULL AND ($11::numeric IS NULL OR ${alias}.price_minor >= $11) AND ($12::numeric IS NULL OR ${alias}.price_minor <= $12)))`;
    const productFilter = listingFilter("q");
    const departmentFilter = `(($8::text='all' AND $9::text='all' AND $10::text IS NULL) OR EXISTS(SELECT 1 FROM products department_product WHERE department_product.shop_id=d.shop_id AND department_product.department_id=d.id AND department_product.availability<>'archived' AND ${listingFilter("department_product")}))`;
    const query = value.query
      ? `hits AS (
   SELECT e.id,ts_rank_cd(s.search_document,plainto_tsquery('english',$1))::double precision+0.2 AS score,NULL::text AS context,NULL::text AS department_slug,NULL::text AS product_slug FROM eligible e JOIN shops s ON s.id=e.id WHERE s.search_document@@plainto_tsquery('english',$1)
   UNION ALL SELECT e.id,ts_rank_cd(d.search_document,plainto_tsquery('english',$1))::double precision+0.1,d.name,d.slug,NULL::text FROM departments d JOIN eligible e ON e.id=d.shop_id WHERE d.archived=false AND d.search_document@@plainto_tsquery('english',$1) AND ${departmentFilter}
   UNION ALL SELECT e.id,ts_rank_cd(q.search_document,plainto_tsquery('english',$1))::double precision,q.name,d.slug,q.slug FROM products q JOIN departments d ON d.id=q.department_id AND d.archived=false JOIN eligible e ON e.id=q.shop_id WHERE q.availability<>'archived' AND q.search_document@@plainto_tsquery('english',$1) AND ${productFilter}
  ), best AS (SELECT DISTINCT ON(id) id,score,context,department_slug,product_slug FROM hits ORDER BY id,score DESC,context,department_slug,product_slug)`
      : refined
        ? `best AS (SELECT DISTINCT ON(e.id) e.id,extract(epoch FROM e.created_at)::double precision AS score,q.name AS context,d.slug AS department_slug,q.slug AS product_slug FROM eligible e JOIN products q ON q.shop_id=e.id JOIN departments d ON d.id=q.department_id AND d.shop_id=e.id AND d.archived=false WHERE q.availability<>'archived' AND ${productFilter} ORDER BY e.id,q.position,q.id)`
        : `best AS (SELECT id,extract(epoch FROM created_at)::double precision AS score,NULL::text AS context,NULL::text AS department_slug,NULL::text AS product_slug FROM eligible)`;
    const rows = await transaction(this.pool, async (client) => {
      await client.query("SET LOCAL statement_timeout='2000ms'");
      return (
        await client.query(
          `WITH eligible AS (SELECT s.id,s.name,s.slug,s.tagline,s.category,s.created_at FROM shops s ${eligibilityJoins} JOIN shop_designs sd ON sd.shop_id=s.id AND sd.published_id IS NOT NULL WHERE length($1::text)<=80 AND ${eligibleStates} AND ($2::text IS NULL OR s.category=$2) AND ($3::uuid IS NULL OR s.id=$3) AND ($7::uuid[] IS NULL OR s.id=ANY($7))
     AND (($8::text='all' AND $9::text='all' AND $10::text IS NULL) OR EXISTS(SELECT 1 FROM products filter_product JOIN departments filter_department ON filter_department.id=filter_product.department_id AND filter_department.shop_id=s.id AND filter_department.archived=false WHERE filter_product.shop_id=s.id AND filter_product.availability<>'archived' AND ${listingFilter("filter_product")}))), ${query}
   SELECT e.id,e.name,e.slug,e.tagline,e.category,COALESCE(budget_match.name,b.context) AS context,COALESCE(budget_match.department_slug,b.department_slug) AS department_slug,COALESCE(budget_match.slug,b.product_slug) AS product_slug,b.score,
     CASE WHEN match_product.id IS NOT NULL THEN json_build_object('id',match_product.id,'name',match_product.name,'kind',match_product.kind,'price_minor',match_product.price_minor::text,'currency',match_product.currency,'availability',match_product.availability) ELSE NULL END AS match,
     (SELECT json_build_object('id',a.id,'alt',a.alt,'width',a.width,'height',a.height)
      FROM media_assets a JOIN shops image_shop ON image_shop.id=a.shop_id AND image_shop.merchant_id=a.merchant_id
      JOIN shop_designs image_design ON image_design.shop_id=a.shop_id
      JOIN shop_revisions image_revision ON image_revision.id=image_design.published_id AND image_revision.shop_id=a.shop_id
      WHERE a.shop_id=e.id AND a.state='ready' AND a.created_by IS NOT NULL AND a.alt<>'' AND a.width>0 AND a.height>0
        AND (SELECT count(*) FROM media_blobs image_blob WHERE image_blob.asset_id=a.id AND image_blob.variant IN ('thumbnail','card','display'))=3
        AND (image_revision.design->'branding'->>'coverAssetId'=a.id::text
             OR EXISTS(SELECT 1 FROM products image_product
                       JOIN departments image_department ON image_department.id=image_product.department_id AND image_department.shop_id=image_product.shop_id AND image_department.archived=false
                       JOIN product_media image_media ON image_media.product_id=image_product.id AND image_media.shop_id=image_product.shop_id AND image_media.merchant_id=image_product.merchant_id
                       WHERE image_product.shop_id=e.id AND image_product.availability<>'archived' AND image_media.asset_id=a.id))
      ORDER BY EXISTS(SELECT 1 FROM product_media hit_media WHERE hit_media.product_id=match_product.id AND hit_media.asset_id=a.id AND hit_media.shop_id=e.id) DESC,(image_revision.design->'branding'->>'coverAssetId'=a.id::text) DESC NULLS LAST,a.id LIMIT 1) AS image
   FROM best b JOIN eligible e ON e.id=b.id
   LEFT JOIN LATERAL (
     SELECT q.name,q.slug,d.slug AS department_slug FROM products q
     JOIN departments d ON d.id=q.department_id AND d.shop_id=e.id AND d.archived=false
     WHERE $10::text IS NOT NULL AND b.product_slug IS NULL AND q.shop_id=e.id AND q.availability<>'archived'
       AND (b.department_slug IS NULL OR d.slug=b.department_slug) AND ${productFilter}
     ORDER BY q.position,q.id LIMIT 1
   ) budget_match ON true
   LEFT JOIN products match_product ON match_product.shop_id=e.id AND match_product.slug=COALESCE(budget_match.slug,b.product_slug) AND match_product.availability<>'archived'
   WHERE ($4::double precision IS NULL OR b.score<$4 OR (b.score=$4 AND e.id>$5::uuid)) ORDER BY b.score DESC,e.id LIMIT $6`,
          [
            value.query,
            value.category ?? null,
            value.shopId ?? null,
            cursor?.score ?? null,
            cursor?.id ?? null,
            value.limit + 1,
            value.shopIds ?? null,
            value.kind,
            value.availability,
            budget ? value.currency : null,
            minMinor,
            maxMinor,
          ],
        )
      ).rows as (DiscoveryResult & { score: number })[];
    });
    const page = rows.slice(0, value.limit),
      last = page.at(-1);
    return {
      results: page.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        tagline: row.tagline,
        category: row.category,
        context: row.context,
        department_slug: row.department_slug,
        product_slug: row.product_slug,
        image: row.image ?? null,
        match: row.match ?? null,
      })),
      nextCursor:
        rows.length > value.limit && last
          ? Buffer.from(JSON.stringify({ v: 1, scope, score: last.score, id: last.id })).toString(
              "base64url",
            )
          : null,
      query: value.query,
    };
  }
}
