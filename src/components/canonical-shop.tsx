import Link from "next/link";
import type { CSSProperties } from "react";
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

export function CanonicalProduct({
  product,
  view,
  large = false,
}: {
  product: PublicProduct;
  view: ShopView;
  large?: boolean;
}) {
  return (
    <article className="product-card canonical-product">
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
      {large ? (
        <h1>{product.name}</h1>
      ) : (
        <h3>
          <Link prefetch={false} href={`/shops/${view.shop.slug}/products/${product.slug}`}>
            {product.name}
          </Link>
        </h3>
      )}
      <p>{formatMinorMoney(product.price_minor, product.currency)}</p>
      <p>
        {product.availability === "available"
          ? product.kind === "service"
            ? "Service available"
            : "Available"
          : "Currently unavailable"}
      </p>
      {large ? <p>{product.description}</p> : null}
    </article>
  );
}
function Contacts({ view }: { view: ShopView }) {
  const c = view.contact;
  if (!c) return <p>Contact details will appear when the shop provides them.</p>;
  const actions = shopContactActions(view);
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
    return (
      <section
        id={space.id}
        className={"designer-hero designer-hero--" + space.variant}
        aria-labelledby={space.id + "-title"}
      >
        <div className="designer-hero__copy">
          <p className="eyebrow">{view.shop.category}</p>
          <h1 id={space.id + "-title"}>{copyText(space.title)}</h1>
          {space.subtitle ? <p>{copyText(space.subtitle)}</p> : null}
          {space.cta === "browse" ? (
            <a className="button" href="#shop-collections">
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
        <p className="eyebrow">{department.name}</p>
        <h2 id={space.id + "-title"}>{copyText(space.title)}</h2>
        <p>{copyText(space.body)}</p>
        <Link
          className="button button--outline"
          prefetch={false}
          href={"/shops/" + view.shop.slug + "/departments/" + department.slug}
        >
          Explore {department.name}
        </Link>
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
  const c = view.contact,
    actions = view.specification.actions,
    presentation = view.specification.presentation,
    shopStyle = presentation
      ? ({
          "--shop-primary": palette[presentation.palette.primary],
          "--shop-secondary": palette[presentation.palette.secondary],
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
          "shell shop-page canonical-shop theme-" +
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
        <nav aria-label="Shop navigation" className="filter-chips">
          <Link prefetch={false} href="/">
            The mall
          </Link>
          <Link prefetch={false} href={`/shops/${view.shop.slug}`}>
            Whole shop
          </Link>
          {view.departments.map((d) => (
            <Link
              prefetch={false}
              key={d.id}
              href={`/shops/${view.shop.slug}/departments/${d.slug}`}
            >
              {d.name}
            </Link>
          ))}
        </nav>
        {!view.selectedProduct ? (
          <header className="canonical-heading">
            <p className="eyebrow">Independent shop</p>
            <h1>{view.shop.name}</h1>
            <p>{view.shop.tagline}</p>
            <p>{view.specification.announcement}</p>
          </header>
        ) : null}
        {!view.privatePreview ? <SearchForm shopId={view.shop.id} maxLength={80} /> : null}
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
            href={`/shops/${view.shop.slug}`}
            action="Browse the whole shop"
          />
        ) : view.selectedProduct ? (
          <section className="shop-content-section">
            <p className="eyebrow">{view.shop.name}</p>
            <CanonicalProduct product={view.selectedProduct} view={view} large />
            <Contacts view={view} />
          </section>
        ) : view.selectedDepartment ? (
          <section className="shop-content-section">
            <h2>{view.selectedDepartment.name}</h2>
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
                  href={`/shops/${view.shop.slug}/departments/${view.selectedDepartment.slug}`}
                >
                  First page
                </Link>
              ) : null}
              {view.nextCursor ? (
                <Link
                  prefetch={false}
                  href={`/shops/${view.shop.slug}/departments/${view.selectedDepartment.slug}?after=${view.nextCursor}`}
                >
                  Next products
                </Link>
              ) : null}
            </nav>
          </section>
        ) : (
          view.specification.spaces.map((space) => {
            if (
              space.type === "hero" ||
              space.type === "featured_product" ||
              space.type === "product_section" ||
              space.type === "department_editorial" ||
              space.type === "commerce_info"
            )
              return <DesignerSection key={space.id} space={space} view={view} />;
            if ("body" in space)
              return (
                <section key={space.id} id={space.id} className="shop-content-section">
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
                <h2>{"title" in space ? space.title : department?.name}</h2>
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
                            href={`/shops/${view.shop.slug}/products/${product.slug}`}
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
        {!view.selectedProduct ? (
          <section id="shop-collections" className="shop-content-section">
            <h2>Make a connection</h2>
            <Contacts view={view} />
          </section>
        ) : null}
        <aside className="shop-contact-note">
          {development ? (
            <p>
              This development mall uses fictional merchants. No payment is collected by Londos.
            </p>
          ) : (
            <p>Londos does not collect payment for purchases from shops.</p>
          )}
          <p>
            Merchant terms apply to purchases and fulfilment. A contact action is not a confirmed
            sale.
          </p>
          {!view.privatePreview && development ? (
            <Link prefetch={false} href={`/report/${view.shop.id}`}>
              Report a concern about this shop
            </Link>
          ) : null}
          {!view.privatePreview && !development ? (
            <Link prefetch={false} href="/report">
              Reporting information
            </Link>
          ) : null}
        </aside>
      </div>
    </PilotObserver>
  );
}
