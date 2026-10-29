import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { databaseBrowsing } from "@/server/preview";
import { database } from "@/server/db/pool";
import { readComparison, type ComparisonProduct } from "@/server/product-comparison";
import { comparisonIds } from "@/modules/discovery/comparison";
import { formatMinorMoney } from "@/modules/money";
import { publicShopHref } from "@/modules/discovery/shop-continuity";
import {
  ComparisonSelection,
  RemoveComparisonLink,
} from "@/components/product-comparison-controls";
import { fulfilmentLabel } from "@/components/shop-buying-details";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Compare products",
  robots: { index: false, follow: false },
};
const selection = z
  .string()
  .max(147)
  .transform((value) => value.split(","))
  .pipe(comparisonIds);
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ products?: string | string[] }>;
}) {
  const params = await searchParams;
  const parsed = selection.safeParse(params.products);
  let products: ComparisonProduct[] = [];
  let unavailable = false;
  const live = databaseBrowsing();
  if (parsed.success && live) {
    try {
      products = await readComparison(database(), parsed.data);
    } catch {
      unavailable = true;
    }
  }
  const href = (product: ComparisonProduct) =>
    publicShopHref({ shopSlug: product.shop_slug, productSlug: product.slug });
  return (
    <section className="shell page-section comparison-page">
      <div className="page-heading">
        <p className="eyebrow">Make room for a better decision</p>
        <h1>
          Compare <em>products.</em>
        </h1>
        <p>Review up to four listings together, then speak directly with the shop you choose.</p>
      </div>
      {!live ? (
        <p className="notice">
          Product comparison is available in the live mall. Sample shops in this preview cannot be
          added.
        </p>
      ) : params.products !== undefined && !parsed.success ? (
        <div role="alert">
          <EmptyState
            title="Check these selections."
            description="Choose up to four products using their comparison buttons."
            href="/compare"
            action="Start a new comparison"
          />
        </div>
      ) : unavailable ? (
        <div role="alert">
          <EmptyState
            title="Comparison is temporarily unavailable."
            description="Try again shortly. You can still visit a shop using a link you already have."
            href="/compare"
            action="Try your selections again"
          />
        </div>
      ) : parsed.success ? (
        <>
          {products.length < parsed.data.length ? (
            <p role="status" className="notice">
              Some selections are no longer public and have been left out.
            </p>
          ) : null}
          {products.length ? (
            <>
              <p className="comparison-note">
                These are current advertised listing prices. Currencies are not converted; delivery
                costs and merchant terms may differ. Confirm the total and availability with each
                shop.
              </p>
              <p id="comparison-scroll-help" className="comparison-scroll-help">
                Swipe or scroll the table sideways to see every selection.
              </p>
              <div
                className="comparison-table-region"
                role="region"
                aria-label="Product comparison"
                aria-describedby="comparison-scroll-help"
                tabIndex={0}
              >
                <table
                  className="comparison-table"
                  style={{ minWidth: Math.max(680, products.length * 220 + 155) }}
                >
                  <caption>Compare listing details and merchant arrangements</caption>
                  <thead>
                    <tr>
                      <th scope="col">Details</th>
                      {products.map((product) => (
                        <th scope="col" key={product.id}>
                          <Link prefetch={false} href={href(product)}>
                            {product.name}
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Shop</th>
                      {products.map((product) => (
                        <td key={product.id}>
                          <Link
                            prefetch={false}
                            href={publicShopHref({ shopSlug: product.shop_slug })}
                          >
                            {product.shop_name}
                          </Link>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">Listing price</th>
                      {products.map((product) => (
                        <td key={product.id}>
                          <strong>{formatMinorMoney(product.price_minor, product.currency)}</strong>
                          <br />
                          {product.currency}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">Availability</th>
                      {products.map((product) => (
                        <td key={product.id}>
                          {product.availability === "available"
                            ? "Available"
                            : "Currently unavailable"}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">Listing type</th>
                      {products.map((product) => (
                        <td key={product.id}>
                          {product.kind === "service" ? "Service" : "Product"}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">Department</th>
                      {products.map((product) => (
                        <td key={product.id}>{product.department_name}</td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">Collection & delivery</th>
                      {products.map((product) => (
                        <td key={product.id}>
                          {fulfilmentLabel(product.fulfilment)}
                          <br />
                          <small>Provided by the shop; confirm costs and timing.</small>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">Description</th>
                      {products.map((product) => (
                        <td key={product.id}>
                          {product.description
                            ? `${product.description.slice(0, 500)}${product.description.length > 500 ? "…" : ""}`
                            : "Ask the shop for details."}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">Next step</th>
                      {products.map((product) => (
                        <td key={product.id}>
                          <Link prefetch={false} href={href(product)}>
                            View listing & contact shop
                          </Link>
                          <br />
                          <RemoveComparisonLink
                            id={product.id}
                            name={product.name}
                            remaining={products.filter((p) => p.id !== product.id).map((p) => p.id)}
                          />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              {products.length === 1 ? (
                <p>Add another product to compare it alongside this one.</p>
              ) : null}
            </>
          ) : (
            <EmptyState
              title="No current listings in this comparison."
              description="Choose another product from an open shop."
              href="/search"
              action="Find products"
            />
          )}
        </>
      ) : null}
      {live ? (
        <ComparisonSelection />
      ) : (
        <Link href="/search" className="button">
          Explore the sample mall
        </Link>
      )}
      <noscript>
        <p>
          Use the product links to explore the mall. New comparison selections require JavaScript
          and browser storage; a shared comparison link can be read without JavaScript.
        </p>
      </noscript>
    </section>
  );
}
