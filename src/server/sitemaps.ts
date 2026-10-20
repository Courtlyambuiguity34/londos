import type { Pool } from "pg";
import { categories } from "../modules/catalogue/fixtures";
import { eligibleStates, eligibilityJoins } from "./public-eligibility";

export const sitemapSize = 5000;
const catalogueKinds = ["shops", "departments", "products"] as const;
type CatalogueKind = (typeof catalogueKinds)[number];
export type SitemapKind = CatalogueKind | "pages";
export function sitemapKind(value: string): value is SitemapKind {
  return value === "pages" || catalogueKinds.some((kind) => kind === value);
}
export function sitemapPage(value: string): number | null {
  return /^(0|[1-9]\d{0,4})\.xml$/.test(value) ? Number(value.slice(0, -4)) : null;
}
export function sitemapPages(count: number): number {
  if (!Number.isSafeInteger(count) || count < 0) throw Error("Invalid sitemap size");
  return Math.ceil(count / sitemapSize);
}

// Server-owned SQL fragments match public eligibility and published revision joins.
// No drafts, accounts or contact details enter the sitemap.
const base = `FROM shops s ${eligibilityJoins}
  JOIN shop_designs sd ON sd.shop_id=s.id
  JOIN shop_revisions r ON r.id=sd.published_id AND r.shop_id=s.id`;
const queries = {
  shops: { from: base, filter: eligibleStates, select: "s.slug", order: "s.id" },
  departments: {
    from: `${base} JOIN departments d ON d.shop_id=s.id`,
    filter: `${eligibleStates} AND d.archived=false`,
    select: "s.slug,d.slug AS child",
    order: "s.id,d.id",
  },
  products: {
    from: `${base} JOIN departments d ON d.shop_id=s.id JOIN products q ON q.department_id=d.id AND q.shop_id=s.id`,
    filter: `${eligibleStates} AND d.archived=false AND q.availability<>'archived'`,
    select: "s.slug,q.slug AS child",
    order: "s.id,q.id",
  },
};

export async function sitemapPaths(
  pool: Pool,
  kind?: SitemapKind,
  page = 0,
): Promise<string[] | null> {
  if (kind === "pages")
    return page === 0 ? ["/", ...categories.map((c) => `/categories/${c.slug}`)] : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='5s'");
    const counts: Partial<Record<CatalogueKind, number>> = {};
    for (const entry of kind ? [kind] : catalogueKinds) {
      const query = queries[entry];
      const result = await client.query(
        `SELECT count(*) AS count ${query.from} WHERE ${query.filter}`,
      );
      counts[entry] = sitemapPages(Number(result.rows[0].count));
    }
    if (!kind) {
      // Do not silently truncate if the sitemap index protocol limit is reached.
      if (Object.values(counts).reduce((a, b) => a + b, 1) > 50000)
        throw Error("Sitemap index capacity exceeded");
      return [
        "/sitemaps/pages/0.xml",
        ...catalogueKinds.flatMap((entry) =>
          Array.from({ length: counts[entry]! }, (_, n) => `/sitemaps/${entry}/${n}.xml`),
        ),
      ];
    }
    if (!Number.isSafeInteger(page) || page < 0 || page >= counts[kind]!) return null;
    const query = queries[kind];
    const result = await client.query<{ slug: string; child?: string }>(
      `SELECT ${query.select} ${query.from} WHERE ${query.filter} ORDER BY ${query.order} LIMIT $1 OFFSET $2`,
      [sitemapSize, page * sitemapSize],
    );
    return result.rows.map(
      (row) =>
        `/shops/${encodeURIComponent(row.slug)}${kind === "shops" ? "" : `/${kind}/${encodeURIComponent(row.child!)}`}`,
    );
  } finally {
    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }
}

export function sitemapXML(origin: string, paths: string[], index = false): string {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!,
    );
  const root = index ? "sitemapindex" : "urlset",
    entry = index ? "sitemap" : "url";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<${entry}><loc>${escape(origin + path)}</loc></${entry}>`).join("")}</${root}>`;
}

export const sitemapHeaders = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "no-store",
};
