import { publicShopHref } from "@/modules/discovery/shop-continuity";
import Link from "next/link";
import { renderPilotContext } from "@/server/analytics";
import { PilotObserver } from "./pilot-observer";
import { categories } from "@/modules/catalogue/fixtures";
import { database } from "@/server/db/pool";
import { PostgresSearch, type DiscoveryResult } from "@/server/discovery";
import { SearchForm } from "./search-form";
import { EmptyState } from "./empty-state";
import { randomUUID } from "node:crypto";
import { failureCategory } from "@/server/diagnostics";
export function CanonicalShopCard({ result }: { result: DiscoveryResult }) {
  const href = publicShopHref({
    shopSlug: result.slug,
    departmentSlug: result.department_slug,
    productSlug: result.product_slug,
  });
  return (
    <article className="shop-card tone-clay">
      <div className="shop-card-body">
        <p className="eyebrow">
          {categories.find((c) => c.slug === result.category)?.name ?? "Independent shop"}
        </p>
        <h3>
          <Link prefetch={false} href={href} data-pilot-shop={result.id}>
            {result.name}
          </Link>
        </h3>
        <p>{result.tagline}</p>
        {result.context ? <p className="match-context">Explore {result.context}</p> : null}
      </div>
    </article>
  );
}
export async function CanonicalDirectory({
  query = "",
  category,
  cursor,
  shopId,
  entrance = false,
}: {
  query?: string;
  category?: string | undefined;
  cursor?: string | undefined;
  shopId?: string | undefined;
  entrance?: boolean;
}) {
  let result: Awaited<ReturnType<PostgresSearch["search"]>> | null = null;
  let failure: unknown;
  try {
    result = await new PostgresSearch(database()).search({
      query,
      ...(category ? { category: category as "fashion" } : {}),
      ...(cursor ? { cursor } : {}),
      ...(shopId ? { shopId } : {}),
      limit: entrance ? 8 : 20,
    });
  } catch (error) {
    failure = error;
  }
  if (!result) {
    const invalid =
      failure instanceof Error &&
      (failure.name === "ZodError" || ("code" in failure && failure.code === "invalid_cursor"));
    const reference = invalid ? null : randomUUID();
    if (reference)
      console.error(
        JSON.stringify({
          event: "discovery.failed",
          reference,
          category: failureCategory(failure),
        }),
      );
    return (
      <section className="shell page-section">
        <SearchForm query={query.slice(0, 80)} maxLength={80} />
        <div role="alert">
          <EmptyState
            title={invalid ? "Check this search." : "Search is temporarily unavailable."}
            description={
              invalid
                ? "Use up to eight words and 80 characters, or start a new search."
                : "Please try again shortly. A shop you already know may still be available at its direct link."
            }
            href="/search"
            action="Start a new search"
          />
        </div>
        {reference ? <p className="status-message">Support reference: {reference}</p> : null}
      </section>
    );
  }
  const next = new URLSearchParams({ q: query });
  if (category) next.set("category", category);
  if (shopId) next.set("shop", shopId);
  if (result.nextCursor) next.set("cursor", result.nextCursor);
  return (
    <PilotObserver
      capture={renderPilotContext({
        page: entrance ? "mall" : "search",
        shopId: null,
        departmentId: null,
        productId: null,
        shops: result.results.map((r) => r.id),
        resultCount: result.results.length,
        globalDiscovery: !shopId,
        channels: [],
      })}
    >
      <section className="shell page-section">
        <div className="page-heading">
          <p className="eyebrow">Independent shops, together</p>
          <h1>
            {entrance ? (
              <>
                Good shops.
                <br />
                All <em>together.</em>
              </>
            ) : query ? (
              <>Shops for “{query.slice(0, 80)}”</>
            ) : (
              "Explore the mall"
            )}
          </h1>
          <p>Discover a shop, then explore its departments and make a connection.</p>
        </div>
        <SearchForm
          query={query}
          maxLength={80}
          {...(category ? { category } : {})}
          {...(shopId ? { shopId } : {})}
        />
        <nav className="filter-chips" aria-label="Filter by category">
          <Link prefetch={false} href={`/search?q=${encodeURIComponent(query)}`}>
            All shops
          </Link>
          {categories.map((c) => (
            <Link
              prefetch={false}
              key={c.slug}
              href={`/search?category=${c.slug}&q=${encodeURIComponent(query)}`}
              aria-current={category === c.slug ? "page" : undefined}
            >
              {c.name}
            </Link>
          ))}
        </nav>
        <p>{result.results.length} shops on this page</p>
        {result.results.length ? (
          <div className="shop-grid">
            {result.results.map((row) => (
              <CanonicalShopCard key={row.id} result={row} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No shops matched this search."
            description="Try another name or category, or check back as more shops open."
          />
        )}
        {result.nextCursor ? (
          <Link prefetch={false} className="button button--outline" href={`/search?${next}`}>
            Next shops
          </Link>
        ) : null}
        {entrance ? (
          <Link prefetch={false} href="/search">
            Explore all shops
          </Link>
        ) : null}
      </section>
    </PilotObserver>
  );
}
