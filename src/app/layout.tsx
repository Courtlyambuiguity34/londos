import type { Metadata } from "next";
import type { Viewport } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { PwaRegistrar } from "@/components/pwa-registrar";
import { assertPreviewConfiguration } from "@/server/preview";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Londos — A place for good shops", template: "%s | Londos" },
  description:
    "Discover independent shops, enter their world, and find something that feels like you. Londos digital mall preview.",
  manifest: "/pwa/public/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Londos", statusBarStyle: "default" },
  icons: { apple: "/pwa/icon-192.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#16382b" };

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  assertPreviewConfiguration();
  return (
    <html lang="en-UG">
      <body>
        <PwaRegistrar />
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
