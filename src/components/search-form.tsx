import { Icon } from "./icon";
import { MAX_QUERY_LENGTH } from "@/modules/discovery/preview-directory";

export function SearchForm({
  query = "",
  large = false,
  category,
}: {
  query?: string;
  large?: boolean;
  category?: string;
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
        maxLength={MAX_QUERY_LENGTH}
      />
      {category ? <input type="hidden" name="category" value={category} /> : null}
      <button type="submit" aria-label="Search the mall">
        <span>Search</span>
        <Icon name="arrow" />
      </button>
    </form>
  );
}
