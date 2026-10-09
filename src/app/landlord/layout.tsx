import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  manifest: "/pwa/landlord/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Londos Management", statusBarStyle: "default" },
};

export default function LandlordLayout({ children }: { children: ReactNode }) {
  return children;
}
