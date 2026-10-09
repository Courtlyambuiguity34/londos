export const pwaSurfaces = ["public", "shopkeeper", "landlord"] as const;
export type PwaSurface = (typeof pwaSurfaces)[number];

const surfaceDetails = {
  public: {
    name: "Londos Mall",
    shortName: "Londos",
    description: "Discover and visit independent shops in Londos.",
    startUrl: "/",
  },
  shopkeeper: {
    name: "Londos Shopkeeper",
    shortName: "Shopkeeper",
    description: "Manage an authorized Londos shop from an installable client.",
    startUrl: "/shopkeeper",
  },
  landlord: {
    name: "Londos Management",
    shortName: "Management",
    description: "Open the MFA-protected Londos operator workspace.",
    startUrl: "/landlord",
  },
} as const;

export function isPwaSurface(value: string): value is PwaSurface {
  return pwaSurfaces.includes(value as PwaSurface);
}

export function pwaManifest(surface: PwaSurface) {
  const details = surfaceDetails[surface];
  return {
    id: `/pwa/${surface}`,
    name: details.name,
    short_name: details.shortName,
    description: details.description,
    start_url: details.startUrl,
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fffaf1",
    theme_color: "#16382b",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      {
        src: "/pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
    shortcuts: [
      { name: "Mall", short_name: "Mall", url: "/", icons: [] },
      { name: "Shopkeeper", short_name: "Shopkeeper", url: "/shopkeeper", icons: [] },
      { name: "Management", short_name: "Management", url: "/landlord", icons: [] },
    ],
  };
}
