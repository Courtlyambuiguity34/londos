import { databaseBrowsing } from "@/server/preview";
import { CanonicalDirectory } from "@/components/canonical-directory";
import type { Metadata } from "next";
import Link from "next/link";
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
  }>;
}) {
  const params = await searchParams;
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
      <nav aria-label="Filter by category" className="filter-chips">
        <Link
          href={query ? `/search?q=${encodeURIComponent(query)}` : "/search"}
          aria-current={!category ? "page" : undefined}
        >
          All shops
        </Link>
        {categories.map((item) => (
          <Link
            key={item.slug}
            href={`/search?category=${item.slug}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
            aria-current={category === item.slug ? "page" : undefined}
          >
            {item.name}
          </Link>
        ))}
      </nav>
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
