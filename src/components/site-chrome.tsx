import Link from "next/link";
import Image from "next/image";
import { Icon } from "./icon";
import { previewCapabilities } from "@/server/preview";
import { workspaceAccess, requestPathname, isWorkspacePath } from "@/server/navigation";
import { MobileNavigation } from "./mobile-navigation";

export async function SiteHeader() {
  const pathname = await requestPathname();
  if (isWorkspacePath(pathname)) return null;
  const mode = previewCapabilities().mode;
  const access = await workspaceAccess();
  return (
    <>
      {mode !== "database-core" ? (
        <div className="preview-notice" role="region" aria-label="Preview status">
          {mode === "database-development"
            ? "Development mall · Fictional merchants and sample catalogues. No payments are collected by Londos."
            : "Preview mall · Fictional shops and illustrated products. Purchases are unavailable in this preview."}
        </div>
      ) : null}
      <header className="site-header shell">
        <Link href="/" className="wordmark" aria-label="Londos home">
          <Image
            src="/brand/londos-logo.png"
            alt=""
            width={1200}
            height={400}
            className="brand-logo"
            priority
            unoptimized
          />
        </Link>
        <nav aria-label="Main navigation" className="main-nav">
          <Link href="/search">Explore shops</Link>
          <Link href="/saved">Saved shops</Link>
          <Link href="/about">Our mall</Link>
        </nav>
        <div className="header-actions">
          {access.shopkeeper ? (
            <Link href="/shopkeeper" className="shopkeeper-link">
              Shopkeeper <Icon name="external" />
            </Link>
          ) : null}
          {access.landlord ? (
            <Link href="/landlord" className="shopkeeper-link">
              Management <Icon name="external" />
            </Link>
          ) : null}
          {!access.landlord || access.shopkeeper ? (
            <Link href="/rent-a-shop" className="button button--small">
              Open your shop <Icon name="arrow" />
            </Link>
          ) : null}
        </div>
        <MobileNavigation
          showShopkeeper={access.shopkeeper}
          showLandlord={access.landlord}
          showRentCta={!access.landlord || access.shopkeeper}
        />
      </header>
    </>
  );
}

export async function SiteFooter() {
  const pathname = await requestPathname();
  if (isWorkspacePath(pathname)) return null;
  const access = await workspaceAccess();
  const mode = previewCapabilities().mode;
  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <div>
          <Link href="/" className="wordmark" aria-label="Londos home">
            <Image
              src="/brand/londos-logo.png"
              alt=""
              width={1200}
              height={400}
              className="brand-logo"
              unoptimized
            />
          </Link>
          <p>
            A place for good shops.
            <br />
            And the people behind them.
          </p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/search">Explore the mall</Link>
          <Link href="/saved">Saved shops</Link>
          {!access.landlord || access.shopkeeper ? (
            <Link href="/rent-a-shop">Become a shopkeeper</Link>
          ) : null}
          <Link href="/about">About Londos</Link>
          <Link href="/install">Install Londos</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms of use</Link>
        </nav>
        <p className="footer-note">
          Made for discovery.
          <br />
          Built around the shop.
          {mode !== "database-core" ? (
            <>
              <br />
              <span>
                {mode === "database-development"
                  ? "Development mall with fictional merchants."
                  : "Read-only product preview."}
              </span>
            </>
          ) : null}
        </p>
      </div>
      <div className="shell footer-bottom">
        <span>© 2026 Londos</span>
        <span>Independent shops. One shared destination.</span>
      </div>
    </footer>
  );
}
