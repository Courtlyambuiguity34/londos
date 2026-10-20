import { database } from "@/server/db/pool";
import { indexingOrigin } from "@/server/search-indexing";
import { sitemapPaths, sitemapXML, sitemapHeaders } from "@/server/sitemaps";

export const dynamic = "force-dynamic";
export async function GET() {
  const origin = indexingOrigin();
  if (!origin) return new Response(null, { status: 404, headers: sitemapHeaders });
  try {
    const paths = await sitemapPaths(database());
    return new Response(sitemapXML(origin, paths!, true), { headers: sitemapHeaders });
  } catch {
    return new Response(null, { status: 503, headers: { ...sitemapHeaders, "Retry-After": "60" } });
  }
}
