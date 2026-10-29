import { Icon } from "./icon";
import { MAX_QUERY_LENGTH } from "@/modules/discovery/preview-directory";

export function SearchForm({
  query = "",
  large = false,
  category,
  shopId,
  maxLength = MAX_QUERY_LENGTH,
  shopName,
  kind = "all",
  availability = "all",
  currency = "UGX",
  minPrice = "",
  maxPrice = "",
}: {
  query?: string;
  large?: boolean;
  category?: string;
  shopId?: string;
  maxLength?: number;
  shopName?: string;
  kind?: string;
  availability?: string;
  currency?: string;
  minPrice?: string;
  maxPrice?: string;
}) {
  return (
    <form
      action="/search"
      method="get"
      role="search"
      className={`search-form ${large ? "search-form--large" : ""}`}
    >
      <Icon name="search" />
      <label className="sr-only" htmlFor={large ? "hero-search" : "directory-search"}>
        {shopId ? `Search ${shopName ?? "this shop"}` : "Search shops and what they sell"}
      </label>
      <input
        id={large ? "hero-search" : "directory-search"}
        type="search"
        name="q"
        placeholder={
          shopId
            ? "Find a product or service in this shop…"
            : "Try shoes, homeware, a favourite shop…"
        }
        defaultValue={query}
        maxLength={maxLength}
      />
      {category ? <input type="hidden" name="category" value={category} /> : null}
      {shopId ? <input type="hidden" name="shop" value={shopId} /> : null}
      {kind !== "all" ? <input type="hidden" name="kind" value={kind} /> : null}
      {availability !== "all" ? (
        <input type="hidden" name="availability" value={availability} />
      ) : null}
      {minPrice || maxPrice ? (
        <>
          <input type="hidden" name="currency" value={currency} />
          {minPrice ? <input type="hidden" name="minPrice" value={minPrice} /> : null}
          {maxPrice ? <input type="hidden" name="maxPrice" value={maxPrice} /> : null}
        </>
      ) : null}
      <button type="submit" aria-label={shopId ? "Search this shop" : "Search the mall"}>
        <span>Search</span>
        <Icon name="arrow" />
      </button>
    </form>
  );
}
