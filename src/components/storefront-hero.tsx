import Link from "next/link";
import type { ShopView } from "@/server/public-shop";
import { ReadyImage } from "./ready-image";
import { shopViewHref } from "@/modules/shop-design/view-links";
import { categories } from "@/modules/catalogue/fixtures";
import { shopContactActions } from "@/modules/shop-design/contact-actions";
import { Icon } from "./icon";

export function StorefrontHero({ view }: { view: ShopView }) {
  const cover = view.brandingImages?.find(
    (image) => image.id === view.specification.branding?.coverAssetId,
  );
  const product = view.products.find(
    (product) => product.media_id && product.alt && product.width && product.height,
  );
  const image =
    cover ??
    (product
      ? { id: product.media_id!, alt: product.alt!, width: product.width!, height: product.height! }
      : null);
  const logo = view.brandingImages?.find(
    (image) => image.id === view.specification.branding?.logoAssetId,
  );
  const contacts = shopContactActions(view);
  if (view.selectedProduct)
    return (
      <div className="storefront-breadcrumb">
        <Link prefetch={false} href={shopViewHref(view)}>
          {view.shop.name}
        </Link>
        <span aria-hidden="true">/</span>
        <span>{view.selectedProduct.name}</span>
      </div>
    );
  return (
    <header
      className={`storefront-hero${image && !view.selectedDepartment ? " has-storefront-image" : ""}${view.selectedDepartment ? " storefront-hero--compact" : ""}`}
    >
      <div className="storefront-hero-copy">
        {logo ? (
          <div className="storefront-logo">
            <ReadyImage
              shopId={view.shop.id}
              assetId={logo.id}
              alt={logo.alt}
              width={logo.width}
              height={logo.height}
              privatePreview={view.privatePreview}
            />
          </div>
        ) : null}
        <p className="eyebrow">
          {view.selectedDepartment
            ? view.shop.name
            : (categories.find((category) => category.slug === view.shop.category)?.name ??
              "Independent shop")}
        </p>
        <h1>{view.selectedDepartment?.name ?? view.shop.name}</h1>
        {view.shop.tagline ? <p className="storefront-introduction">{view.shop.tagline}</p> : null}
        {!view.selectedDepartment ? (
          <div className="storefront-hero-actions">
            <a className="button" href="#shop-collections">
              Explore collections <Icon name="arrow" />
            </a>
            {contacts[0] ? (
              <a
                className="storefront-contact-link"
                href={contacts[0].href}
                {...(contacts[0].external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {contacts[0].label} →
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
      {image && !view.selectedDepartment ? (
        <div className="storefront-cover">
          <ReadyImage
            shopId={view.shop.id}
            assetId={image.id}
            alt={image.alt}
            width={image.width}
            height={image.height}
            privatePreview={view.privatePreview}
            large
          />
        </div>
      ) : null}
    </header>
  );
}
export function StorefrontCollections({ view }: { view: ShopView }) {
  if (!view.departments.length) return <div id="shop-collections" />;
  return (
    <section
      id="shop-collections"
      className="storefront-collections"
      aria-labelledby="collections-heading"
    >
      <div className="storefront-section-heading">
        <div>
          <p className="eyebrow">Find your favourites</p>
          <h2 id="collections-heading">Shop by collection.</h2>
        </div>
        <span>
          {view.departments.length} {view.departments.length === 1 ? "department" : "departments"}
        </span>
      </div>
      <div className="storefront-collection-grid">
        {view.departments.slice(0, 12).map((department) => {
          const product = view.products.find(
            (item) =>
              item.department_id === department.id &&
              item.media_id &&
              item.alt &&
              item.width &&
              item.height,
          );
          return (
            <Link
              key={department.id}
              href={shopViewHref(view, { department: department.slug })}
              prefetch={false}
              className="storefront-collection-card"
            >
              <div className="storefront-collection-art">
                {product ? (
                  <ReadyImage
                    shopId={view.shop.id}
                    assetId={product.media_id!}
                    alt={product.alt!}
                    width={product.width!}
                    height={product.height!}
                    privatePreview={view.privatePreview}
                  />
                ) : (
                  <span aria-hidden="true">{department.name.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <span>
                {department.name}
                <Icon name="arrow" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
