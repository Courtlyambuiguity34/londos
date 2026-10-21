import type { Metadata } from "next";
import Link from "next/link";
import { PwaInstallButton } from "@/components/pwa-install-button";

export const metadata: Metadata = { title: "Install Londos" };

export default function InstallPage() {
  return (
    <section className="shell page-section prose-page">
      <p className="eyebrow">Your mall, one tap away</p>
      <h1>Install Londos from your browser.</h1>
      <p>
        Add Londos to your phone or computer for quick access to your favourite shops. You can also
        keep using this website without installing anything. An internet connection is needed to
        browse current products and send enquiries.
      </p>
      <PwaInstallButton />
      <h2>How to install</h2>
      <ul>
        <li>
          <strong>Android:</strong> open Londos in Chrome. Tap Install Londos above, or use the
          browser menu and choose Install app or Add to Home screen.
        </li>
        <li>
          <strong>iPhone or iPad:</strong> open Londos in Safari, tap Share, then Add to Home
          Screen.
        </li>
        <li>
          <strong>Windows, macOS or Linux:</strong> use Chrome or Edge and choose Install from the
          address bar or browser menu. On supported Safari versions, choose File → Add to Dock.
        </li>
      </ul>
      <p>
        If your browser does not offer installation, bookmark Londos instead. All shopping features
        remain available in the browser. Installing does not create an account or grant access to a
        private workspace.
      </p>
      <Link className="button button--outline" href="/">
        Back to the mall
      </Link>
    </section>
  );
}
