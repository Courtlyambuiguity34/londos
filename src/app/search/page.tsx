import { databaseBrowsing } from "@/server/preview";
import { CanonicalDirectory } from "@/components/canonical-directory";
import type { Metadata } from "next";
import { BrowseRail } from "@/components/browse-rail";
import { SearchForm } from "@/components/search-form";
import { ShopCard } from "@/components/shop-card";
import { EmptyState } from "@/components/empty-state";
import { categories } from "@/modules/catalogue/fixtures";
import { findCategory, searchPreviewShops } from "@/modules/discovery/preview-directory";

export const metadata: Metadata = { title: "Explore the mall" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    category?: string | string[];
    cursor?: string | string[];
    shop?: string | string[];
    kind?: string | string[];
    availability?: string | string[];
    currency?: string | string[];
    minPrice?: string | string[];
    maxPrice?: string | string[];
  }>;
}) {
  const params = await searchParams;
  if (Object.values(params).some(Array.isArray))
    return (
      <section className="shell page-section">
        <div role="alert">
          <EmptyState
            title="Check this search."
            description="Choose one value for each search field or start a new search."
            href="/search"
            action="Start a new search"
          />
        </div>
      </section>
    );
  const query = typeof params.q === "string" ? params.q : "";
  const category = typeof params.category === "string" ? params.category : undefined;
  if (databaseBrowsing())
    return (
      <CanonicalDirectory
        query={query}
        category={category}
        cursor={typeof params.cursor === "string" ? params.cursor : undefined}
        shopId={typeof params.shop === "string" ? params.shop : undefined}
        kind={typeof params.kind === "string" ? params.kind : "all"}
        availability={typeof params.availability === "string" ? params.availability : "all"}
        currency={typeof params.currency === "string" ? params.currency : "UGX"}
        minPrice={typeof params.minPrice === "string" ? params.minPrice : ""}
        maxPrice={typeof params.maxPrice === "string" ? params.maxPrice : ""}
      />
    );
  const result = searchPreviewShops({ query, ...(category ? { category } : {}) });
  return (
    <section className="shell page-section">
      <div className="page-heading">
        <p className="eyebrow">A little curiosity goes a long way</p>
        <h1>
          {query ? (
            <>
              Shops for <em>“{query.length > 60 ? `${query.slice(0, 60)}…` : query}”</em>
            </>
          ) : (
            <>
              Find your next
              <br />
              <em>favourite shop.</em>
            </>
          )}
        </h1>
        <p>
          {query
            ? "Find a match, then explore the rest of the shop."
            : "Independent businesses. Their own identity. One shared destination."}
        </p>
      </div>
      <div className="search-page-form">
        <SearchForm query={query} {...(category ? { category } : {})} />
      </div>
      <BrowseRail
        label="Filter by category"
        items={[
          {
            href: query ? `/search?q=${encodeURIComponent(query)}` : "/search",
            label: "All shops",
            current: !category,
            shopIcon: true,
          },
          ...categories.map((item) => ({
            href: `/search?category=${item.slug}${query ? `&q=${encodeURIComponent(query)}` : ""}`,
            label: item.name,
            current: category === item.slug,
            symbol: item.symbol,
          })),
        ]}
      />
      {params.minPrice || params.maxPrice ? (
        <p role="status" className="notice">
          Budget filtering is available in the live mall. This sample directory is showing results
          without a budget.
        </p>
      ) : null}
      {result.error ? (
        <div role="alert" className="notice notice--error">
          {result.error}
        </div>
      ) : null}
      <div className="results-heading">
        <p>
          {result.results.length} {result.results.length === 1 ? "shop" : "shops"}
          {findCategory(category ?? "") ? ` in ${findCategory(category ?? "")?.name}` : ""}
        </p>
        <span>Sample directory</span>
      </div>
      {result.results.length ? (
        <div className="shop-grid">
          {result.results.map((item) => (
            <ShopCard key={item.shop.id} result={item} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="A different direction, perhaps?"
          description="No sample shops match this search. Try a broader word or explore another corner of the mall."
        />
      )}
    </section>
  );
}
