import { databaseBrowsing } from "@/server/preview";
import { PublicShopPage, publicShopTitle } from "@/components/public-shop-page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findShop, publicPreviewProducts } from "@/modules/discovery/preview-directory";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ShopHeader } from "@/components/shop-header";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (databaseBrowsing()) return { title: await publicShopTitle(slug) };
  const shop = findShop(slug);
  return { title: shop?.previewState === "open" ? shop.name : "Shop unavailable" };
}

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (databaseBrowsing()) return <PublicShopPage slug={slug} />;
  const shop = findShop(slug);
  if (!shop) notFound();
  if (shop.previewState !== "open")
    return (
      <section className="shell page-section">
        <EmptyState
          title={
            shop.previewState === "closed"
              ? "This shop is temporarily closed."
              : "This shop is unavailable."
          }
          description="You can still explore other shops in the mall. This preview does not accept purchases or enquiries."
        />
      </section>
    );
  const catalogue = publicPreviewProducts(shop);
  const arrivals = catalogue.filter((product) => product.tags.includes("new-arrival"));
  return (
    <div className="shell shop-page">
      <Breadcrumbs items={[{ label: "The mall", href: "/" }, { label: shop.name }]} />
      <ShopHeader shop={shop} />
      <section className="shop-content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A fresh perspective</p>
            <h2>New arrivals</h2>
          </div>
          <span className="muted">Illustrated sample collection</span>
        </div>
        <div className="product-grid">
          {arrivals.map((product) => (
            <ProductCard key={product.id} product={product} shop={shop} />
          ))}
        </div>
      </section>
      <section className="shop-content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Stay a little longer</p>
            <h2>Explore the departments</h2>
          </div>
        </div>
        <div className="department-grid">
          {shop.departments.map((department) => (
            <Link
              key={department.slug}
              href={`/shops/${shop.slug}/departments/${department.slug}`}
              className={`department-card tone-${shop.colour}`}
            >
              <span>{department.name}</span>
              <p>{department.description}</p>
              <Icon name="arrow" />
            </Link>
          ))}
        </div>
      </section>
      <aside className="shop-contact-note">
        <Icon name="shield" />
        <div>
          <h2>A preview of what’s possible.</h2>
          <p>
            These shops and prices are fictional. Merchant contact, purchases and enquiries are
            unavailable in this preview.
          </p>
        </div>
      </aside>
    </div>
  );
}
