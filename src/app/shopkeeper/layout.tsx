import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  manifest: "/pwa/shopkeeper/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Londos Shopkeeper", statusBarStyle: "default" },
};

export default function ShopkeeperLayout({ children }: { children: ReactNode }) {
  return children;
}
