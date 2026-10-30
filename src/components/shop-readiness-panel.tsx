import Link from "next/link";
import type { PhotoHealth } from "@/server/shop-photo-health";
export function ShopReadinessPanel({ health, shopId }: { health: PhotoHealth; shopId: string }) {
  const base = `/shopkeeper/shops/${shopId}`;
  return (
    <section className="workspace-panel photo-readiness" aria-label="Shop photo check">
      <h2>
        {health.missingProductCount
          ? `${health.missingProductCount} ${health.missingProductCount === 1 ? "product needs" : "products need"} a photo`
          : health.products
            ? "Check your shop photos"
            : "Start with your first product"}
      </h2>
      <p>
        {health.pictured} of {health.products} current listings have a ready photo. A product photo
        also supplies its department’s thumbnail.
      </p>
      {health.missingProducts.length ? (
        <ul>
          {health.missingProducts.map((item) => (
            <li key={item.id}>
              <Link href={`${base}/products/${item.id}/edit`}>Add a photo to {item.name} →</Link>
            </li>
          ))}
        </ul>
      ) : null}
      {health.missingDepartments.length ? (
        <p>
          Departments without a product photo:{" "}
          {health.missingDepartments.map((d) => d.name).join(", ")}. Add a photographed product to
          give each one a thumbnail.
        </p>
      ) : null}
      <Link className="button button--small" href={`${base}/products/new`}>
        {health.products ? "Add a product" : "Add your first product"}
      </Link>
    </section>
  );
}
