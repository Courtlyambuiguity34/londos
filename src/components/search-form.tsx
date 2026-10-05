import { Icon } from "./icon";
import { MAX_QUERY_LENGTH } from "@/modules/discovery/preview-directory";

export function SearchForm({
  query = "",
  large = false,
  category,
  shopId,
  maxLength = MAX_QUERY_LENGTH,
}: {
  query?: string;
  large?: boolean;
  category?: string;
  shopId?: string;
  maxLength?: number;
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
        Search shops and what they sell
      </label>
      <input
        id={large ? "hero-search" : "directory-search"}
        type="search"
        name="q"
        placeholder="Try shoes, homeware, a favourite shop…"
        defaultValue={query}
        maxLength={maxLength}
      />
      {category ? <input type="hidden" name="category" value={category} /> : null}
      {shopId ? <input type="hidden" name="shop" value={shopId} /> : null}
      <button type="submit" aria-label="Search the mall">
        <span>Search</span>
        <Icon name="arrow" />
      </button>
    </form>
  );
}
