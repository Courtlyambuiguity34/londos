import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { renderPilotContext } from "@/server/analytics";
import { PilotObserver } from "./pilot-observer";
import type { CaptureInput } from "@/modules/analytics/contract";
import type { ShopView, PublicProduct } from "@/server/public-shop";
import { formatMinorMoney } from "@/modules/money";
import { ReadyImage } from "./ready-image";
import { EmptyState } from "./empty-state";
import { SearchForm } from "./search-form";
import { spaceProducts, type ShopSpace } from "@/modules/shop-design/specification";
import { shopContactActions } from "@/modules/shop-design/contact-actions";
import { coreConfig } from "@/server/config";
import { shopViewHref } from "@/modules/shop-design/view-links";
import { findShopTheme } from "@/modules/shop-themes/catalogue";
import { readableForeground } from "@/modules/shop-themes/colors";
import { distinctShopSections } from "@/modules/shop-themes/sections";
import { StorefrontHero, StorefrontCollections } from "./storefront-hero";
import { Icon } from "./icon";
import { SaveShopButton } from "./save-shop-button";
import { ShareShopButton } from "./share-shop-button";
import { BrowseRail } from "./browse-rail";
import { ShopPurchaseNote } from "./shop-purchase-note";

export function CanonicalProduct({
  product,
  view,
  large = false,
  detail = false,
}: {
  product: PublicProduct;
  view: ShopView;
  large?: boolean;
  detail?: boolean;
}) {
  return (
    <article
      className={`product-card canonical-product${detail ? " storefront-product-detail" : ""}`}
    >
      <div className="storefront-product-image">
        {product.media_id && product.alt && product.width && product.height ? (
          <ReadyImage
            shopId={view.shop.id}
            assetId={product.media_id}
            alt={product.alt}
            width={product.width}
            height={product.height}
            privatePreview={view.privatePreview}
            large={large}
          />
        ) : (
          <div className="image-placeholder" role="img" aria-label={`No image for ${product.name}`}>
            Image coming soon
          </div>
        )}
      </div>
      <div className="storefront-product-copy">
        {detail ? (
          <h1>{product.name}</h1>
        ) : (
          <h3>
            <Link prefetch={false} href={shopViewHref(view, { product: product.slug })}>
              {product.name}
            </Link>
          </h3>
        )}
        <p className="storefront-product-price">
          {formatMinorMoney(product.price_minor, product.currency)}
        </p>
        <p className="storefront-product-availability">
          {product.availability === "available"
            ? product.kind === "service"
              ? "Service available"
              : "Available"
            : "Currently unavailable"}
        </p>
        {large ? <p>{product.description}</p> : null}
        {detail ? (
          <div id="product-contact" className="product-contact-panel">
            <h2>Interested in this {product.kind === "service" ? "service" : "product"}?</h2>
            <p>Ask {view.shop.name} about availability and arrangements.</p>
            <Contacts view={view} />
            <Link
              prefetch={false}
              href={shopViewHref(view, {
                department: view.departments.find(
                  (department) => department.id === product.department_id,
                )?.slug,
              })}
            >
              Explore more from this shop <Icon name="arrow" />
            </Link>
          </div>
        ) : null}
        {!detail ? (
          <Link
            className="storefront-product-explore"
            href={shopViewHref(view, { product: product.slug })}
            prefetch={false}
          >
            View {product.kind === "service" ? "service" : "product"} <Icon name="arrow" />
          </Link>
        ) : null}
      </div>
    </article>
  );
}
function Contacts({ view }: { view: ShopView }) {
  const c = view.contact;
  if (!c) return <p>Contact details will appear when the shop provides them.</p>;
  const actions = shopContactActions(view).map((action) => {
    if (action.kind !== "whatsapp" || !view.selectedProduct || view.privatePreview) return action;
    const href = new URL(action.href);
    href.searchParams.set(
      "text",
      `Hello, I'd like to ask about ${view.selectedProduct.name}. ${new URL(shopViewHref(view, { product: view.selectedProduct.slug }), coreConfig().baseURL).href}`,
    );
    return { ...action, href: href.href };
  });
  return (
    <div className="canonical-contacts">
      <div className="button-row">
        {actions.map((action, index) => (
          <a
            key={action.kind}
            className={index === 0 ? "button" : "button button--outline"}
            href={action.href}
            data-pilot-contact={action.kind}
            {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {action.label}
          </a>
        ))}
      </div>
      {!actions.length ? <p>This shop has not enabled a contact method yet.</p> : null}
      {c.delivery_instructions ? <p>{c.delivery_instructions}</p> : null}
      {c.payment_instructions ? <p>{c.payment_instructions}</p> : null}
      <p>
        Agree purchases and payment directly with the merchant. An enquiry is not a confirmed order.
      </p>
    </div>
  );
}

const palette: Record<string, string> = {
  cream: "#f7f0e3",
  burgundy: "#6f1735",
  gold: "#b38a3e",
  charcoal: "#292827",
  white: "#ffffff",
  black: "#151515",
  stone: "#d8d2c8",
  sand: "#e5d2b4",
  terracotta: "#a9563f",
  sage: "#8a9a7b",
  forest: "#304b3b",
  navy: "#243a5a",
  sky: "#9fc6dc",
  plum: "#603950",
};

function copyText(value: { text: string } | null) {
  return value?.text ?? "";
}

function DesignerSection({ space, view }: { space: ShopSpace; view: ShopView }) {
  if (space.type === "hero") {
    const product = space.featuredProductId
      ? view.products.find((item) => item.id === space.featuredProductId)
      : null;
    const cover = view.brandingImages?.find(
      (image) => image.id === view.specification.branding?.coverAssetId,
    );
    const collection = view.specification.spaces.find((item) => {
      if (item.type === "featured_product")
        return view.products.some((entry) => entry.id === item.productId);
      if (["product_section", "display", "gallery"].includes(item.type)) return true;
      return (
        (item.type === "department" || item.type === "collection") &&
        view.departments.some((entry) => entry.id === item.departmentId)
      );
    });
    return (
      <section
        id={space.id}
        className={
          "designer-hero designer-hero--" +
          space.variant +
          (product || cover ? " has-designer-image" : "")
        }
        aria-labelledby={space.id + "-title"}
      >
        <div className="designer-hero__copy">
          <p className="eyebrow">{view.shop.category}</p>
          <h2 id={space.id + "-title"}>{copyText(space.title)}</h2>
          {space.subtitle ? <p>{copyText(space.subtitle)}</p> : null}
          {space.cta === "browse" ? (
            <a className="button" href={collection ? `#${collection.id}` : "#shop-departments"}>
              Browse collection
            </a>
          ) : space.cta === "whatsapp" &&
            shopContactActions(view).some((action) => action.kind === "whatsapp") ? (
            <a
              className="button"
              href={shopContactActions(view).find((action) => action.kind === "whatsapp")!.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp shop
            </a>
          ) : space.cta === "enquiry" &&
            shopContactActions(view).some((action) => action.kind === "enquiry") ? (
            <Link className="button" href={"/contact/" + view.shop.id}>
              Enquire with the shop
            </Link>
          ) : null}
        </div>
        {product ? (
          <div className="designer-hero__product">
            <CanonicalProduct product={product} view={view} large />
          </div>
        ) : cover ? (
          <div className="designer-hero__image">
            <ReadyImage
              shopId={view.shop.id}
              assetId={cover.id}
              alt={cover.alt}
              width={cover.width}
              height={cover.height}
              privatePreview={view.privatePreview}
              large
            />
          </div>
        ) : null}
      </section>
    );
  }
  if (space.type === "featured_product") {
    const product = view.products.find((item) => item.id === space.productId);
    if (!product) return null;
    return (
      <section
        id={space.id}
        className={"designer-feature designer-feature--" + space.variant}
        aria-labelledby={space.id + "-title"}
      >
        <div className="designer-feature__intro">
          <p className="eyebrow">Featured</p>
          <h2 id={space.id + "-title"}>{copyText(space.title)}</h2>
        </div>
        <CanonicalProduct product={product} view={view} large />
      </section>
    );
  }
  if (space.type === "product_section") {
    const products = spaceProducts(space, view.products);
    return (
      <section
        id={space.id}
        className={"shop-content-section designer-products designer-products--" + space.variant}
        aria-labelledby={space.id + "-title"}
      >
        <h2 id={space.id + "-title"}>{copyText(space.title)}</h2>
        <div className="product-grid designer-product-grid">
          {products.map((product) => (
            <CanonicalProduct key={product.id} product={product} view={view} />
          ))}
        </div>
      </section>
    );
  }
  if (space.type === "department_editorial") {
    const department = view.departments.find((item) => item.id === space.departmentId);
    if (!department) return null;
    return (
      <section
        id={space.id}
        className={"designer-department designer-department--" + space.variant}
        aria-labelledby={space.id + "-title"}
      >
        <div className="designer-department-copy">
          <p className="eyebrow">{department.name}</p>
          <h2 id={space.id + "-title"}>{copyText(space.title)}</h2>
          <p>{copyText(space.body)}</p>
          <Link
            className="button button--outline"
            prefetch={false}
            href={shopViewHref(view, { department: department.slug })}
          >
            Explore {department.name}
          </Link>
        </div>
        {space.variant === "split"
          ? (() => {
              const product = view.products.find(
                (item) =>
                  item.department_id === department.id &&
                  item.media_id &&
                  item.alt &&
                  item.width &&
                  item.height,
              );
              return product ? (
                <div className="designer-department-image">
                  <ReadyImage
                    shopId={view.shop.id}
                    assetId={product.media_id!}
                    alt={product.alt!}
                    width={product.width!}
                    height={product.height!}
                    privatePreview={view.privatePreview}
                  />
                </div>
              ) : null;
            })()
          : null}
      </section>
    );
  }
  if (space.type === "commerce_info")
    return (
      <section
        id={space.id}
        className={"designer-commerce designer-commerce--" + space.variant}
        aria-label="Shop contact, payment and fulfilment information"
      >
        <h2>How to buy from this shop</h2>
        <Contacts view={view} />
      </section>
    );
  return null;
}

export function CanonicalShop({ view, proposal = false }: { view: ShopView; proposal?: boolean }) {
  const development = coreConfig().localAdapters;
  const theme = findShopTheme(view.specification.storefrontTheme);
  const spaces = distinctShopSections(view.specification.spaces);
  const primaryHero = spaces.find((space) => space.type === "hero")?.id;
  const hasProductSections = spaces.some(
    (space) =>
      "productIds" in space ||
      "departmentId" in space ||
      (space.type === "hero" && space.featuredProductId),
  );
  const c = view.contact,
    actions = view.specification.actions,
    presentation = view.specification.presentation,
    shopStyle = presentation
      ? ({
          "--shop-primary": palette[presentation.palette.primary],
          "--shop-secondary": palette[presentation.palette.secondary],
          "--shop-on-secondary": readableForeground(presentation.palette.secondary),
          "--shop-background": palette[presentation.palette.background],
          "--shop-surface": palette[presentation.palette.surface],
          "--shop-text": palette[presentation.palette.text],
          "--shop-accent": palette[presentation.palette.accent],
          "--shop-mobile-columns": String(presentation.productColumns.mobile),
          "--shop-desktop-columns": String(presentation.productColumns.desktop),
        } as CSSProperties)
      : undefined;
  const channels: NonNullable<CaptureInput["channel"]>[] = [];
  if (c?.phone && actions.includes("call")) channels.push("call");
  if (c?.whatsapp && actions.includes("whatsapp")) channels.push("whatsapp");
  if (c?.enquiries_enabled && actions.includes("enquiry")) channels.push("enquiry");
  if (c?.website) channels.push("website");
  return (
    <PilotObserver
      capture={
        view.privatePreview
          ? null
          : renderPilotContext({
              page: view.selectedProduct
                ? "product"
                : view.selectedDepartment
                  ? "department"
                  : "shop",
              shopId: view.shop.id,
              departmentId: view.selectedDepartment?.id ?? null,
              productId: view.selectedProduct?.id ?? null,
              shops: [],
              resultCount: 0,
              globalDiscovery: false,
              channels,
            })
      }
    >
      <div
        className={
          `shell shop-page canonical-shop storefront${view.selectedProduct ? " storefront--product" : ""}${theme ? ` storefront-${theme.id} hero-${theme.layout.hero} cards-${theme.layout.cards} collections-${theme.layout.departments} corners-${theme.layout.radius}` : ""} theme-` +
          view.specification.theme +
          (presentation
            ? " designer-premise premise-" +
              presentation.premiseStyle +
              " density-" +
              presentation.density +
              " width-" +
              presentation.contentWidth +
              " type-" +
              presentation.typography +
              " nav-desktop-" +
              presentation.navigation.desktop +
              " nav-mobile-" +
              presentation.navigation.mobile
            : "")
        }
        style={shopStyle}
      >
        {view.privatePreview ? (
          <aside className="notice" aria-label="Private preview">
            {proposal ? (
              "Private proposal preview · Not saved. Applying creates a draft; publication requires a separate confirmation."
            ) : (
              <>
                Private design preview · Revision {view.revision}. Publication requires a separate
                confirmation.
              </>
            )}
          </aside>
        ) : null}
        <BrowseRail
          id="shop-departments"
          label="Shop navigation"
          kind="departments"
          items={[
            { href: "/", label: "The mall" },
            {
              href: shopViewHref(view),
              label: "Whole shop",
              current: !view.selectedDepartment && !view.selectedProduct,
            },
            ...view.departments.map((d) => ({
              href: shopViewHref(view, { department: d.slug }),
              label: d.name,
              current: view.selectedDepartment?.id === d.id,
            })),
          ]}
        />
        {!view.privatePreview ? (
          <div className="storefront-visitor-tools">
            <Link prefetch={false} href={shopViewHref(view)}>
              Shop home
            </Link>
            <div>
              <SaveShopButton id={view.shop.id} name={view.shop.name} />
              <ShareShopButton
                path={shopViewHref(
                  view,
                  view.selectedProduct ? { product: view.selectedProduct.slug } : {},
                )}
                title={
                  view.selectedProduct
                    ? `${view.selectedProduct.name} · ${view.shop.name}`
                    : view.shop.name
                }
              />
            </div>
          </div>
        ) : null}
        {view.specification.announcement ? (
          <div className="storefront-announcement">{view.specification.announcement}</div>
        ) : null}
        <StorefrontHero view={view} />
        {!view.privatePreview ? (
          <div className="storefront-search">
            <SearchForm shopId={view.shop.id} shopName={view.shop.name} maxLength={80} />
          </div>
        ) : null}
        {!view.selectedDepartment && !view.selectedProduct && !primaryHero ? (
          <StorefrontCollections view={view} />
        ) : null}
        {view.applicationReviewed && development ? (
          <p className="notice">
            Development application reviewed. This fictional local review does not guarantee
            identity, products or payments.
          </p>
        ) : null}
        {view.missingDestination ? (
          <EmptyState
            title="This item has moved or is unavailable."
            description="Explore the shop's current departments and products."
            href={shopViewHref(view)}
            action="Browse the whole shop"
          />
        ) : view.selectedProduct ? (
          <section className="shop-content-section">
            <CanonicalProduct product={view.selectedProduct} view={view} large detail />
          </section>
        ) : view.selectedDepartment ? (
          <section className="shop-content-section">
            <div className="storefront-section-heading">
              <h2>Explore {view.selectedDepartment.name}</h2>
              <span>{view.products.length} on this page</span>
            </div>
            <div className="product-grid">
              {view.products.map((product) => (
                <CanonicalProduct key={product.id} product={product} view={view} />
              ))}
            </div>
            {!view.products.length ? <p>New pieces will appear here soon.</p> : null}
            <nav aria-label="Catalogue pages" className="button-row">
              {view.paginated ? (
                <Link
                  prefetch={false}
                  href={shopViewHref(view, { department: view.selectedDepartment.slug })}
                >
                  First page
                </Link>
              ) : null}
              {view.nextCursor ? (
                <Link
                  prefetch={false}
                  href={shopViewHref(view, {
                    department: view.selectedDepartment.slug,
                    after: view.nextCursor,
                  })}
                >
                  Next products
                </Link>
              ) : null}
            </nav>
          </section>
        ) : (
          spaces.map((space) => {
            if (
              space.type === "hero" ||
              space.type === "featured_product" ||
              space.type === "product_section" ||
              space.type === "department_editorial" ||
              space.type === "commerce_info"
            )
              return (
                <Fragment key={space.id}>
                  <DesignerSection space={space} view={view} />
                  {space.id === primaryHero ? <StorefrontCollections view={view} /> : null}
                </Fragment>
              );
            if ("body" in space)
              return (
                <section
                  key={space.id}
                  id={space.id}
                  className={`shop-content-section storefront-narrative storefront-narrative--${space.type}`}
                >
                  <p className="eyebrow">
                    {space.type === "story"
                      ? "Our story"
                      : space.type === "offer"
                        ? "From the shop"
                        : space.type === "service_desk"
                          ? "Here to help"
                          : "Welcome"}
                  </p>
                  <h2>{space.title}</h2>
                  <p>{space.body}</p>
                  {space.type === "service_desk" ? <Contacts view={view} /> : null}
                </section>
              );
            if (space.type === "contact")
              return (
                <section key={space.id} id={space.id} className="shop-content-section">
                  <h2>Contact this shop</h2>
                  <Contacts view={view} />
                </section>
              );
            const department =
              "departmentId" in space
                ? view.departments.find((d) => d.id === space.departmentId)
                : null;
            const products = spaceProducts(space, view.products);
            if ("departmentId" in space && !department) return null;
            return (
              <section key={space.id} id={space.id} className="shop-content-section">
                <div className="storefront-section-heading">
                  <h2>
                    {department ? (
                      <Link
                        prefetch={false}
                        href={shopViewHref(view, { department: department.slug })}
                      >
                        {"title" in space ? space.title : department.name}
                      </Link>
                    ) : "title" in space ? (
                      space.title
                    ) : null}
                  </h2>
                  {department ? (
                    <Link
                      className="department-page-link"
                      prefetch={false}
                      href={shopViewHref(view, { department: department.slug })}
                    >
                      View all {department.name} <Icon name="arrow" />
                    </Link>
                  ) : null}
                </div>
                <div className="product-grid">
                  {products.map((product) =>
                    space.type === "gallery" ? (
                      <figure key={product.id}>
                        {product.media_id && product.alt && product.width && product.height ? (
                          <ReadyImage
                            shopId={view.shop.id}
                            assetId={product.media_id}
                            alt={product.alt}
                            width={product.width}
                            height={product.height}
                            privatePreview={view.privatePreview}
                          />
                        ) : (
                          <p>Image currently unavailable</p>
                        )}
                        <figcaption>
                          <Link
                            prefetch={false}
                            href={shopViewHref(view, { product: product.slug })}
                          >
                            {product.name}
                          </Link>
                        </figcaption>
                      </figure>
                    ) : (
                      <CanonicalProduct key={product.id} product={product} view={view} />
                    ),
                  )}
                </div>
                {!products.length ? <p>New pieces will appear here soon.</p> : null}
              </section>
            );
          })
        )}
        {!view.selectedProduct &&
        !view.selectedDepartment &&
        !hasProductSections &&
        view.products.length ? (
          <section className="shop-content-section" id="shop-products">
            <div className="storefront-section-heading">
              <div>
                <p className="eyebrow">Discover the collection</p>
                <h2>From our shop.</h2>
              </div>
            </div>
            <div className="product-grid">
              {view.products.map((product) => (
                <CanonicalProduct key={product.id} product={product} view={view} />
              ))}
            </div>
          </section>
        ) : null}
        {!view.selectedProduct &&
        !spaces.some(
          (space) =>
            space.type === "contact" ||
            space.type === "commerce_info" ||
            space.type === "service_desk",
        ) ? (
          <section id="shop-contact" className="shop-content-section">
            <h2>Make a connection</h2>
            <Contacts view={view} />
          </section>
        ) : null}
        <ShopPurchaseNote
          development={development}
          {...(!view.privatePreview ? { shopId: view.shop.id } : {})}
        />
        {view.selectedProduct && shopContactActions(view).length && !view.privatePreview ? (
          <aside className="product-mobile-contact" aria-label="Quick product contact">
            <div>
              <strong>
                {formatMinorMoney(view.selectedProduct.price_minor, view.selectedProduct.currency)}
              </strong>
              <span>
                {view.selectedProduct.availability === "available"
                  ? "Ask the shop for details"
                  : "Currently unavailable"}
              </span>
            </div>
            <a className="button" href="#product-contact">
              Contact shop <Icon name="arrow" />
            </a>
          </aside>
        ) : null}
      </div>
    </PilotObserver>
  );
}
