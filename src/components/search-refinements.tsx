import Link from "next/link";
import { searchHref, type SearchLinkInput } from "@/modules/discovery/refinements";

export function SearchRefinements({
  query,
  category,
  shopId,
  kind = "all",
  availability = "all",
}: SearchLinkInput) {
  const count = Number(kind !== "all") + Number(availability !== "all");
  return (
    <details className="search-refinements" open={count > 0}>
      <summary>
        Refine results{" "}
        <span>{count ? `${count} applied` : "Products, services & availability"}</span>
      </summary>
      <form action="/search" method="get" aria-label="Refine shop results">
        {query ? <input type="hidden" name="q" value={query} /> : null}
        {category ? <input type="hidden" name="category" value={category} /> : null}
        {shopId ? <input type="hidden" name="shop" value={shopId} /> : null}
        <fieldset>
          <legend>Find shops offering</legend>
          <div className="search-refinement-field">
            <label htmlFor="search-listing-kind">Listing type</label>
            <select id="search-listing-kind" name="kind" defaultValue={kind}>
              <option value="all">Products & services</option>
              <option value="product">Products</option>
              <option value="service">Services</option>
            </select>
          </div>
          <div className="search-refinement-field">
            <label htmlFor="search-listing-availability">Availability</label>
            <select
              id="search-listing-availability"
              name="availability"
              defaultValue={availability}
            >
              <option value="all">All current listings</option>
              <option value="available">Available listings</option>
            </select>
          </div>
        </fieldset>
        <div className="search-refinements-actions">
          <button type="submit" className="button button--small">
            Apply filters
          </button>
          {count ? (
            <Link href={searchHref({ query, category, shopId })}>Clear refinements</Link>
          ) : null}
        </div>
        <p>Availability is provided by each shop. Confirm details with the merchant.</p>
      </form>
    </details>
  );
}
