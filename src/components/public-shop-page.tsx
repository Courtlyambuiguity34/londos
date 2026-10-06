import { cache } from "react";
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
export async function publicShopTitle(
  slug: string,
  department?: string,
  product?: string,
  after?: string,
) {
  try {
    const current = await view(slug, department, product, after);
    return current.selectedProduct?.name ?? current.selectedDepartment?.name ?? current.shop.name;
  } catch {
    return "Shop unavailable";
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
