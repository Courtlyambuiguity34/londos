import type { MetadataRoute } from "next";
import { indexingOrigin } from "@/server/search-indexing";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = indexingOrigin();
  if (origin)
    return {
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/shopkeeper",
          "/landlord",
          "/security",
          "/sign-in",
          "/register",
          "/recover",
          "/search",
          "/report",
          "/contact",
        ],
      },
      sitemap: `${origin}/sitemap.xml`,
    };
  return { rules: { userAgent: "*", disallow: "/" } };
}
