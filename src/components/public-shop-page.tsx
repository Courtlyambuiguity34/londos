import { cache } from "react";
import type { Metadata } from "next";
import { publicMetadata } from "@/server/search-indexing";
import { notFound, permanentRedirect } from "next/navigation";
import { CanonicalShop } from "./canonical-shop";
import { EmptyState } from "./empty-state";
import { database } from "@/server/db/pool";
import { readPublicShop } from "@/server/public-shop";
import { AccessError } from "@/server/security/errors";
const view = cache((slug: string, department?: string, product?: string, after?: string) =>
  readPublicShop(database(), slug, {
    ...(department ? { department } : {}),
    ...(product ? { product } : {}),
    ...(after !== undefined ? { after } : {}),
  }),
);
export async function publicShopMetadata(
  slug: string,
  department?: string,
  product?: string,
  after?: string,
): Promise<Metadata> {
  try {
    const current = await view(slug, department, product, after);
    const name = current.selectedProduct?.name ?? current.selectedDepartment?.name;
    const title = name ? `${name} — ${current.shop.name}` : current.shop.name;
    if (current.missingDestination || after !== undefined)
      return { title, robots: { index: false, follow: false } };
    const path =
      `/shops/${encodeURIComponent(current.shop.slug)}` +
      (current.selectedProduct
        ? `/products/${encodeURIComponent(current.selectedProduct.slug)}`
        : current.selectedDepartment
          ? `/departments/${encodeURIComponent(current.selectedDepartment.slug)}`
          : "");
    return publicMetadata(
      path,
      title,
      current.selectedProduct?.description ||
        current.shop.tagline ||
        `Explore ${current.shop.name} on Londos.`,
    );
  } catch {
    return { title: "Shop unavailable", robots: { index: false, follow: false } };
  }
}
export async function PublicShopPage({
  slug,
  department,
  product,
  after,
}: {
  slug: string;
  department?: string;
  product?: string;
  after?: string;
}) {
  let current: Awaited<ReturnType<typeof view>> | null = null;
  try {
    current = await view(slug, department, product, after);
  } catch (error) {
    if (error instanceof AccessError && error.status === 404) notFound();
    if (error instanceof AccessError && [409, 422].includes(error.status))
      return (
        <section className="shell page-section">
          <EmptyState
            title={
              error.status === 409
                ? "The catalogue has changed."
                : "This catalogue page is unavailable."
            }
            description="Restart this department to browse the current products."
            href={`/shops/${slug}/departments/${department}`}
            action="Restart department"
          />
        </section>
      );
  }
  if (!current)
    return (
      <section className="shell page-section">
        <EmptyState
          title="This shop could not load."
          description="Please try again shortly. Its current status could not be checked."
        />
      </section>
    );
  const destination = current.selectedDepartment
    ? `/departments/${current.selectedDepartment.slug}`
    : current.selectedProduct
      ? `/products/${current.selectedProduct.slug}`
      : "";
  if (
    slug !== current.shop.slug ||
    (department && current.selectedDepartment && department !== current.selectedDepartment.slug) ||
    (product && current.selectedProduct && product !== current.selectedProduct.slug)
  )
    permanentRedirect(`/shops/${current.shop.slug}${destination}${after ? `?after=${after}` : ""}`);
  return <CanonicalShop view={current} />;
}
