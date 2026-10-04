import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  findShop,
  findPublicProduct,
  formatUgx,
  publicPreviewProducts,
} from "@/modules/discovery/preview-directory";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProductCard } from "@/components/product-card";
import { Icon } from "@/components/icon";

type RouteParams = Promise<{ slug: string; product: string }>;

export async function generateMetadata({ params }: { params: RouteParams }): Promise<Metadata> {
  const route = await params;
  const shop = findShop(route.slug);
  return {
    title: shop
      ? (findPublicProduct(shop, route.product)?.name ?? "Product unavailable")
      : "Product unavailable",
  };
}

export default async function ProductPage({ params }: { params: RouteParams }) {
  const route = await params;
  const shop = findShop(route.slug);
  if (!shop) notFound();
  const product = findPublicProduct(shop, route.product);
  if (!product) notFound();
  const department = shop.departments.find((d) => d.slug === product.departmentSlug);
  const others = publicPreviewProducts(shop)
    .filter((p) => p.id !== product.id)
    .slice(0, 3);
  return (
    <div className="shell product-page">
      <Breadcrumbs
        items={[
          { label: "The mall", href: "/" },
          { label: shop.name, href: `/shops/${shop.slug}` },
          ...(department
            ? [
                {
                  label: department.name,
                  href: `/shops/${shop.slug}/departments/${department.slug}`,
                },
              ]
            : []),
          { label: product.name },
        ]}
      />
      <section className="product-detail">
        <div className={`product-detail-art tone-${shop.colour}`}>
          <Image
            src={`/illustrations/product-${product.art}.svg`}
            alt={`Illustration of ${product.name.toLowerCase()}`}
            width={600}
            height={650}
            priority
          />
        </div>
        <div className="product-detail-copy">
          <Link href={`/shops/${shop.slug}`} className="eyebrow product-shop-link">
            {shop.name}
            <Icon name="arrow" />
          </Link>
          <h1>{product.name}</h1>
          <p className="product-detail-price">
            {formatUgx(product.priceUgx)}
            <span>Illustrative sample price</span>
          </p>
          <p>{product.description}</p>
          <div className="product-preview-note">
            <Icon name="shield" />
            <div>
              <strong>Made for a look around.</strong>
              <p>
                This is a fictional product. Contact, orders and payments are unavailable in this
                preview.
              </p>
            </div>
          </div>
          <Link className="button button--outline" href={`/shops/${shop.slug}`}>
            Explore the rest of the shop
            <Icon name="arrow" />
          </Link>
        </div>
      </section>
      <section className="shop-content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">There’s more inside</p>
            <h2>From the same shop</h2>
          </div>
        </div>
        <div className="product-grid">
          {others.map((item) => (
            <ProductCard key={item.id} product={item} shop={shop} />
          ))}
        </div>
      </section>
    </div>
  );
}
