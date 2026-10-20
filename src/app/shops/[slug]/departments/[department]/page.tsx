import { databaseBrowsing } from "@/server/preview";
import { PublicShopPage, publicShopMetadata } from "@/components/public-shop-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findShop, publicPreviewProducts } from "@/modules/discovery/preview-directory";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ShopHeader } from "@/components/shop-header";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";

type RouteParams = Promise<{ slug: string; department: string }>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: Promise<{ after?: string | string[] }>;
}): Promise<Metadata> {
  const route = await params;
  if (databaseBrowsing()) {
    const query = await searchParams;
    return publicShopMetadata(
      route.slug,
      route.department,
      undefined,
      query.after === undefined
        ? undefined
        : typeof query.after === "string"
          ? query.after
          : "invalid",
    );
  }
  const shop = findShop(route.slug);
  const department =
    shop?.previewState === "open"
      ? shop.departments.find((d) => d.slug === route.department)
      : undefined;
  return {
    title: department && shop ? `${department.name} at ${shop.name}` : "Department unavailable",
  };
}

export default async function DepartmentPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: Promise<{ after?: string | string[] }>;
}) {
  const route = await params;
  if (databaseBrowsing()) {
    const query = await searchParams;
    return (
      <PublicShopPage
        slug={route.slug}
        department={route.department}
        {...(query.after !== undefined
          ? { after: typeof query.after === "string" ? query.after : "invalid" }
          : {})}
      />
    );
  }
  const shop = findShop(route.slug);
  if (!shop || shop.previewState !== "open") notFound();
  const department = shop.departments.find((d) => d.slug === route.department);
  if (!department) notFound();
  const catalogue = publicPreviewProducts(shop).filter(
    (product) => product.departmentSlug === department.slug,
  );
  return (
    <div className="shell shop-page">
      <Breadcrumbs
        items={[
          { label: "The mall", href: "/" },
          { label: shop.name, href: `/shops/${shop.slug}` },
          { label: department.name },
        ]}
      />
      <ShopHeader shop={shop} activeDepartment={department.slug} />
      <section className="shop-content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Inside {shop.name}</p>
            <h2>{department.name}</h2>
            <p>{department.description}</p>
          </div>
          <span className="muted">{catalogue.length} sample pieces</span>
        </div>
        {catalogue.length ? (
          <div className="product-grid">
            {catalogue.map((product) => (
              <ProductCard key={product.id} product={product} shop={shop} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Something new is on the way."
            description="This department has no sample pieces yet. Take a look around the rest of the shop."
            href={`/shops/${shop.slug}`}
            action="Browse the whole shop"
          />
        )}
      </section>
    </div>
  );
}
