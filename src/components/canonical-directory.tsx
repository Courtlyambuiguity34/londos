import Link from "next/link";
import { renderPilotContext } from "@/server/analytics";
import { PilotObserver } from "./pilot-observer";
import { categories } from "@/modules/catalogue/fixtures";
import { database } from "@/server/db/pool";
import { PostgresSearch } from "@/server/discovery";
import { SearchForm } from "./search-form";
import { EmptyState } from "./empty-state";
import { randomUUID } from "node:crypto";
import { failureCategory } from "@/server/diagnostics";
import { Icon } from "./icon";
import { DiscoveryShopCard } from "./discovery-shop-card";
export { DiscoveryShopCard as CanonicalShopCard } from "./discovery-shop-card";
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
  const categoryHref = (value?: string) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (shopId) params.set("shop", shopId);
    if (value) params.set("category", value);
    return `/search${params.size ? `?${params}` : ""}`;
  };
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
      <section
        className={`shell page-section discovery-page${entrance ? " discovery-page--entrance" : ""}`}
      >
        <div className="discovery-intro">
          <div className="page-heading">
            <p className="eyebrow">Independent shops, together</p>
            <h1>
              {entrance ? (
                <>
                  Good shops.
                  <br />
                  All <em>together.</em>
                </>
              ) : shopId ? (
                query ? (
                  <>In this shop: “{query.slice(0, 80)}”</>
                ) : (
                  "Explore this shop"
                )
              ) : query ? (
                <>Shops for “{query.slice(0, 80)}”</>
              ) : (
                "Explore the mall"
              )}
            </h1>
            <p>Discover a shop, then explore its departments and make a connection.</p>
          </div>
          {entrance ? (
            <aside className="discovery-intro-note">
              <span className="discovery-intro-icon">
                <Icon name="shop" />
              </span>
              <p>
                Small businesses.
                <br />
                <strong>A world to discover.</strong>
              </p>
              <span>Find something you love, then talk directly with the people behind it.</span>
            </aside>
          ) : null}
        </div>
        <div className="discovery-search-area">
          <SearchForm
            query={query}
            maxLength={80}
            {...(category ? { category } : {})}
            {...(shopId ? { shopId } : {})}
          />
          <p>Search for a shop, product or service.</p>
        </div>
        <nav className="discovery-categories" aria-label="Filter by category">
          <Link
            prefetch={false}
            href={categoryHref()}
            aria-current={!category ? "page" : undefined}
          >
            <Icon name="shop" />
            All shops
          </Link>
          {categories.map((c) => (
            <Link
              prefetch={false}
              key={c.slug}
              href={categoryHref(c.slug)}
              aria-current={category === c.slug ? "page" : undefined}
            >
              <span className="discovery-category-symbol" aria-hidden="true">
                {c.symbol}
              </span>
              {c.name}
            </Link>
          ))}
        </nav>
        <div className="discovery-results-toolbar">
          <div>
            <h2>
              {entrance
                ? "Find your next favourite."
                : query
                  ? "Your search results"
                  : "Shops to explore"}
            </h2>
            <p className="directory-result-count">
              {result.results.length} {result.results.length === 1 ? "shop" : "shops"} on this page
              {category ? ` · ${categories.find((c) => c.slug === category)?.name ?? "Other"}` : ""}
            </p>
          </div>
          <Link href="/saved" className="discovery-saved-link">
            <Icon name="heart" /> Saved shops
          </Link>
        </div>
        {query || category || cursor || shopId ? (
          <div className="discovery-active-filters">
            <span>{shopId ? "Searching within this shop" : "Searching the mall"}</span>
            {query ? <span>“{query.slice(0, 80)}”</span> : null}
            {category ? <Link href={categoryHref()}>Clear category ×</Link> : null}
            {cursor ? <Link href={categoryHref(category)}>First page</Link> : null}
            {query ? (
              <Link
                href={`/search?${new URLSearchParams({ ...(shopId ? { shop: shopId } : {}), ...(category ? { category } : {}) })}`}
              >
                Clear search ×
              </Link>
            ) : null}
            {shopId ? (
              <Link
                href={`/search?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(category ? { category } : {}) })}`}
              >
                Search all shops
              </Link>
            ) : null}
          </div>
        ) : null}
        {result.results.length ? (
          <div className="shop-grid discovery-grid">
            {result.results.map((row) => (
              <DiscoveryShopCard key={row.id} result={row} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No shops matched this search."
            description="Try another name or category, or check back as more shops open."
            href={
              category
                ? categoryHref()
                : shopId
                  ? `/search?${new URLSearchParams({ shop: shopId })}`
                  : "/search"
            }
            action={
              category
                ? "Search without this category"
                : shopId
                  ? "Browse this shop"
                  : "Browse shops"
            }
          />
        )}
        {result.nextCursor ? (
          <Link
            prefetch={false}
            className="button button--outline discovery-next"
            href={`/search?${next}`}
          >
            Next shops
          </Link>
        ) : null}
        {entrance ? (
          <div className="discovery-finish">
            <Link prefetch={false} href="/search" className="button button--outline">
              Explore all shops <Icon name="arrow" />
            </Link>
            <aside>
              <div>
                <p className="eyebrow">Made for independent businesses</p>
                <h2>Your shop. Your own style.</h2>
                <p>Showcase your products, choose a theme and share one simple shop link.</p>
              </div>
              <Link href="/rent-a-shop" className="button">
                Open your shop <Icon name="arrow" />
              </Link>
            </aside>
          </div>
        ) : null}
      </section>
    </PilotObserver>
  );
}
