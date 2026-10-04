import Image from "next/image";
import Link from "next/link";
import type { ShopResult } from "@/modules/discovery/preview-directory";
import { findCategory } from "@/modules/discovery/preview-directory";
import { Icon } from "./icon";

export function ShopCard({ result }: { result: ShopResult }) {
  const { shop } = result;
  return (
    <article className={`shop-card tone-${shop.colour}`}>
      <Link href={result.href} className="shop-card-art" tabIndex={-1} aria-hidden="true">
        <Image
          src={`/illustrations/shop-${shop.illustration}.svg`}
          alt=""
          width={600}
          height={430}
          className="shop-art"
        />
        <span className="shop-card-stamp">Independent shop</span>
      </Link>
      <div className="shop-card-body">
        <div className="shop-card-meta">
          <span>{findCategory(shop.category)?.name}</span>
          <span>{shop.location}</span>
        </div>
        <h3>
          <Link href={result.href}>
            {shop.name}
            <Icon name="arrow" />
          </Link>
        </h3>
        <p>{shop.tagline}</p>
        {result.context ? (
          <div className="match-context">
            Explore {result.context.toLowerCase()}
            {result.matchingProducts > 0 ? ` · ${result.matchingProducts} sample matches` : ""}
          </div>
        ) : null}
      </div>
    </article>
  );
}
