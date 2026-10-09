import Link from "next/link";
import { Icon } from "./icon";
import { databaseBrowsing } from "@/server/preview";

export function SiteHeader() {
  return (
    <>
      <div className="preview-notice" role="region" aria-label="Preview status">
        {databaseBrowsing()
          ? "Development mall · Fictional merchants and sample catalogues. No payments are collected by Londos."
          : "Preview mall · Fictional shops and illustrated products. Purchases are unavailable in this preview."}
      </div>
      <header className="site-header shell">
        <Link href="/" className="wordmark" aria-label="Londos home">
          londos<span aria-hidden="true">.</span>
        </Link>
        <nav aria-label="Main navigation" className="main-nav">
          <Link href="/search">Explore shops</Link>
          <Link href="/about">Our mall</Link>
        </nav>
        <div className="header-actions">
          <Link href="/shopkeeper" className="shopkeeper-link">
            Shopkeeper <Icon name="external" />
          </Link>
          <Link href="/rent-a-shop" className="button button--small">
            Open your shop <Icon name="arrow" />
          </Link>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <div>
          <Link href="/" className="wordmark">
            londos<span aria-hidden="true">.</span>
          </Link>
          <p>
            A place for good shops.
            <br />
            And the people behind them.
          </p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/search">Explore the mall</Link>
          <Link href="/rent-a-shop">Become a shopkeeper</Link>
          <Link href="/about">About Londos</Link>
          <Link href="/install">Install Londos</Link>
          <Link href="/landlord">Londos Management</Link>
        </nav>
        <p className="footer-note">
          Made for discovery.
          <br />
          Built around the shop.
          <br />
          <span>
            {databaseBrowsing()
              ? "Development mall with fictional merchants."
              : "Read-only product preview."}
          </span>
        </p>
      </div>
      <div className="shell footer-bottom">
        <span>© 2026 Londos</span>
        <span>Independent shops. One shared destination.</span>
      </div>
    </footer>
  );
}
