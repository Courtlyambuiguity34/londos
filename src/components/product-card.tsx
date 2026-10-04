import Image from "next/image";
import Link from "next/link";
import type { PreviewProduct, PreviewShop } from "@/modules/catalogue/types";
import { formatUgx } from "@/modules/discovery/preview-directory";

export function ProductCard({ product, shop }: { product: PreviewProduct; shop: PreviewShop }) {
  return (
    <article className={`product-card tone-${shop.colour}`}>
      <Link
        href={`/shops/${shop.slug}/products/${product.slug}`}
        className="product-art"
        tabIndex={-1}
        aria-hidden="true"
      >
        <Image src={`/illustrations/product-${product.art}.svg`} alt="" width={400} height={440} />
      </Link>
      <div className="product-card-meta">
        {product.tags.includes("new-arrival") ? (
          <span>New arrival</span>
        ) : (
          <span>{product.kind === "service" ? "Service" : "From the collection"}</span>
        )}
      </div>
      <h3>
        <Link href={`/shops/${shop.slug}/products/${product.slug}`}>{product.name}</Link>
      </h3>
      <p>
        {formatUgx(product.priceUgx)} <span className="sample-price">sample price</span>
      </p>
    </article>
  );
}
