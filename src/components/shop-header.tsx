import Image from "next/image";
import Link from "next/link";
import type { PreviewShop } from "@/modules/catalogue/types";
import { findCategory } from "@/modules/discovery/preview-directory";

export function ShopHeader({
  shop,
  activeDepartment,
}: {
  shop: PreviewShop;
  activeDepartment?: string;
}) {
  return (
    <>
      <section className={`shop-hero tone-${shop.colour}`}>
        <div className="shop-hero-copy">
          <div className="shop-identity">
            <span className="shop-initials">{shop.initials}</span>
            <div>
              <p className="eyebrow">
                {findCategory(shop.category)?.name} · {shop.location}
              </p>
              <span>Independent shop in Londos</span>
            </div>
          </div>
          <h1>{shop.name}</h1>
          <p className="shop-tagline">{shop.tagline}</p>
          <p className="shop-description">{shop.description}</p>
        </div>
        <div className="shop-hero-art">
          <Image
            src={`/illustrations/shop-${shop.illustration}.svg`}
            alt={`Illustrated ${findCategory(shop.category)?.name.toLowerCase()} storefront`}
            width={600}
            height={430}
            priority
          />
        </div>
      </section>
      <nav aria-label="Shop departments" className="department-nav">
        <Link href={`/shops/${shop.slug}`} aria-current={!activeDepartment ? "page" : undefined}>
          The whole shop
        </Link>
        {shop.departments.map((department) => (
          <Link
            key={department.slug}
            href={`/shops/${shop.slug}/departments/${department.slug}`}
            aria-current={activeDepartment === department.slug ? "page" : undefined}
          >
            {department.name}
          </Link>
        ))}
      </nav>
    </>
  );
}
