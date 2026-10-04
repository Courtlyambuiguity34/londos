import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { assertPreviewConfiguration } from "@/server/preview";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Londos — A place for good shops", template: "%s | Londos" },
  description:
    "Discover independent shops, enter their world, and find something that feels like you. Londos digital mall preview.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  assertPreviewConfiguration();
  return (
    <html lang="en-UG">
      <body>
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
