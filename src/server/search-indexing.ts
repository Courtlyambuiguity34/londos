import type { Metadata } from "next";
import { coreConfig, coreConfigured } from "./config";

// Opt in only after the real catalogue and canonical domain are ready.
// Never derive canonical URLs from an untrusted Host/forwarded header.
export function indexingOrigin(): string | null {
  if (
    process.env.LONDOS_SEARCH_INDEXING !== "true" ||
    process.env.LONDOS_DATA_SOURCE !== "database" ||
    !coreConfigured()
  )
    return null;
  try {
    const config = coreConfig(),
      url = new URL(config.baseURL);
    if (
      !config.secureCookies ||
      config.localAdapters ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function publicMetadata(path: string, title: string, description: string): Metadata {
  const origin = indexingOrigin();
  if (!origin) return { title, robots: { index: false, follow: false } };
  const canonical = `${origin}${path}`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: "Londos",
      title,
      description,
      url: canonical,
      images: [{ url: `${origin}/brand/londos-logo-dark.png`, alt: "Londos" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/brand/londos-logo-dark.png`],
    },
  };
}
