import { database } from "@/server/db/pool";
import { indexingOrigin } from "@/server/search-indexing";
import {
  sitemapPaths,
  sitemapXML,
  sitemapHeaders,
  sitemapKind,
  sitemapPage,
} from "@/server/sitemaps";

export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; page: string }> },
) {
  const origin = indexingOrigin(),
    { kind, page: raw } = await params,
    page = sitemapPage(raw);
  if (!origin || !sitemapKind(kind) || page === null)
    return new Response(null, { status: 404, headers: sitemapHeaders });
  try {
    const paths = await sitemapPaths(database(), kind, page);
    if (!paths) return new Response(null, { status: 404, headers: sitemapHeaders });
    return new Response(sitemapXML(origin, paths), { headers: sitemapHeaders });
  } catch {
    return new Response(null, { status: 503, headers: { ...sitemapHeaders, "Retry-After": "60" } });
  }
}
