import Link from "next/link";
import type { DiscoveryResult } from "@/server/discovery";
import { categories } from "@/modules/catalogue/fixtures";
import { publicShopHref } from "@/modules/discovery/shop-continuity";
import { formatMinorMoney } from "@/modules/money";
import { ReadyImage } from "./ready-image";
import { SaveShopButton } from "./save-shop-button";
import { Icon } from "./icon";
import { CompareProductButton } from "./product-comparison-controls";

export function DiscoveryShopCard({ result }: { result: DiscoveryResult }) {
  const href = publicShopHref({
    shopSlug: result.slug,
    departmentSlug: result.department_slug,
    productSlug: result.product_slug,
  });
  return (
    <article className="shop-card canonical-directory-card discovery-card">
      <Link
        prefetch={false}
        href={href}
        className="discovery-card-link"
        data-pilot-shop={result.id}
        aria-label={result.context ? `${result.context} at ${result.name}` : result.name}
      >
        <div className="shop-card-art">
          {result.image ? (
            <ReadyImage
              shopId={result.id}
              assetId={result.image.id}
              alt={result.image.alt}
              width={result.image.width}
              height={result.image.height}
              allowRetry={false}
            />
          ) : (
            <div className="shop-card-fallback" aria-hidden="true">
              <Icon name="shop" />
              <span>{result.name.slice(0, 1).toUpperCase()}</span>
            </div>
          )}
          <span className="shop-card-stamp">
            {categories.find((c) => c.slug === result.category)?.name ?? "Independent shop"}
          </span>
        </div>
        <div className="shop-card-body">
          <h3>
            {result.name}
            <Icon name="arrow" />
          </h3>
          <p className="discovery-card-tagline">
            {result.tagline || "Explore this independent shop."}
          </p>
          {result.match ? (
            <div className="discovery-product-match">
              <span>{result.match.kind === "service" ? "Service match" : "Product match"}</span>
              <strong>{result.match.name}</strong>
              <span className="discovery-match-price">
                {formatMinorMoney(result.match.price_minor, result.match.currency)}
              </span>
              <span>
                {result.match.availability === "available"
                  ? "Available · View details"
                  : "Currently unavailable · View details"}
              </span>
            </div>
          ) : result.context ? (
            <p className="match-context">Explore {result.context}</p>
          ) : (
            <span className="discovery-card-cta">
              Explore shop <Icon name="arrow" />
            </span>
          )}
        </div>
      </Link>
      {result.match ? <CompareProductButton id={result.match.id} name={result.match.name} /> : null}
      <SaveShopButton id={result.id} name={result.name} compact />
    </article>
  );
}
