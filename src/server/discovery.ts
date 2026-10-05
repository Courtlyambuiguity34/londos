import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "./db/pool";
import { eligibilityJoins, eligibleStates } from "./public-eligibility";
import { AccessError } from "./security/errors";

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
    cursor: z.string().max(400).optional(),
    limit: z.number().int().min(1).max(20).default(20),
  })
  .strict();
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
      scope = createHash("sha256")
        .update(
          JSON.stringify([value.query.toLowerCase(), value.category ?? null, value.shopId ?? null]),
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
    const query = value.query
      ? `hits AS (
   SELECT e.id,ts_rank_cd(s.search_document,plainto_tsquery('english',$1))::double precision+0.2 AS score,NULL::text AS context,NULL::text AS department_slug FROM eligible e JOIN shops s ON s.id=e.id WHERE s.search_document@@plainto_tsquery('english',$1)
   UNION ALL SELECT e.id,ts_rank_cd(d.search_document,plainto_tsquery('english',$1))::double precision+0.1,d.name,d.slug FROM departments d JOIN eligible e ON e.id=d.shop_id WHERE d.archived=false AND d.search_document@@plainto_tsquery('english',$1)
   UNION ALL SELECT e.id,ts_rank_cd(q.search_document,plainto_tsquery('english',$1))::double precision,q.name,d.slug FROM products q JOIN departments d ON d.id=q.department_id AND d.archived=false JOIN eligible e ON e.id=q.shop_id WHERE q.availability<>'archived' AND q.search_document@@plainto_tsquery('english',$1)
  ), best AS (SELECT DISTINCT ON(id) id,score,context,department_slug FROM hits ORDER BY id,score DESC,context,department_slug)`
      : `best AS (SELECT id,extract(epoch FROM created_at)::double precision AS score,NULL::text AS context,NULL::text AS department_slug FROM eligible)`;
    const rows = await transaction(this.pool, async (client) => {
      await client.query("SET LOCAL statement_timeout='2000ms'");
      return (
        await client.query(
          `WITH eligible AS (SELECT s.id,s.name,s.slug,s.tagline,s.category,s.created_at FROM shops s ${eligibilityJoins} JOIN shop_designs sd ON sd.shop_id=s.id AND sd.published_id IS NOT NULL WHERE length($1::text)<=80 AND ${eligibleStates} AND ($2::text IS NULL OR s.category=$2) AND ($3::uuid IS NULL OR s.id=$3)), ${query}
   SELECT e.id,e.name,e.slug,e.tagline,e.category,b.context,b.department_slug,b.score FROM best b JOIN eligible e ON e.id=b.id WHERE ($4::double precision IS NULL OR b.score<$4 OR (b.score=$4 AND e.id>$5::uuid)) ORDER BY b.score DESC,e.id LIMIT $6`,
          [
            value.query,
            value.category ?? null,
            value.shopId ?? null,
            cursor?.score ?? null,
            cursor?.id ?? null,
            value.limit + 1,
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
