import Link from "next/link";
import { searchHref, type SearchLinkInput } from "@/modules/discovery/refinements";

export function SearchRefinements({
  query,
  category,
  shopId,
  kind = "all",
  availability = "all",
  currency = "UGX",
  minPrice = "",
  maxPrice = "",
}: SearchLinkInput) {
  const count =
    Number(kind !== "all") + Number(availability !== "all") + Number(Boolean(minPrice || maxPrice));
  return (
    <details className="search-refinements" open={count > 0}>
      <summary>
        Refine results <span>{count ? `${count} applied` : "Type, availability & budget"}</span>
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
        <fieldset className="search-price-range" aria-describedby="search-price-help">
          <legend>Your budget</legend>
          <div className="search-refinement-field">
            <label htmlFor="search-currency">Currency</label>
            <select id="search-currency" name="currency" defaultValue={currency}>
              {["UGX", "USD", "KES", "EUR", "GBP"].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div className="search-refinement-field">
            <label htmlFor="search-min-price">Minimum price</label>
            <input
              id="search-min-price"
              name="minPrice"
              type="text"
              inputMode="decimal"
              maxLength={23}
              defaultValue={minPrice}
              placeholder="No minimum"
            />
          </div>
          <div className="search-refinement-field">
            <label htmlFor="search-max-price">Maximum price</label>
            <input
              id="search-max-price"
              name="maxPrice"
              type="text"
              inputMode="decimal"
              maxLength={23}
              defaultValue={maxPrice}
              placeholder="No maximum"
            />
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
        <p id="search-price-help">
          Enter amounts without commas; use whole amounts for UGX. A budget matches prices in the
          selected currency and excludes “Ask for price” listings. Prices and availability are
          provided by each shop; confirm with the merchant.
        </p>
      </form>
    </details>
  );
}
