import type { Metadata } from "next";
import Link from "next/link";
import { PwaInstallButton } from "@/components/pwa-install-button";

export const metadata: Metadata = { title: "Install Londos" };

export default function InstallPage() {
  return (
    <section className="shell page-section prose-page">
      <p className="eyebrow">Windows · macOS · Linux · Android</p>
      <h1>Install Londos from your browser.</h1>
      <p>
        The installable app connects to the same authoritative Londos server as the website. It
        contains no database password, API key or operator secret, and server-side permissions still
        decide what each signed-in account may access.
      </p>
      <PwaInstallButton />
      <h2>Choose the right starting workspace</h2>
      <ul>
        <li>
          <Link href="/">Mall</Link> for customers and public browsing.
        </li>
        <li>
          <Link href="/shopkeeper">Shopkeeper</Link> for merchants and authorized shop staff.
        </li>
        <li>
          <Link href="/landlord">Londos Management</Link> for scoped, MFA-protected operators.
        </li>
      </ul>
      <p>
        To install a role-specific app, open that workspace first and then use the browser’s install
        command. The application needs a network connection to the Londos server; private data is
        not cached for offline use.
      </p>
    </section>
  );
}
