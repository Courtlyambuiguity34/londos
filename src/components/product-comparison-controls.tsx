"use client";
import Link from "next/link";
import { useState } from "react";
import { comparisonHref } from "@/modules/discovery/comparison";
import {
  clearComparison,
  setComparisonProduct,
  useComparison,
} from "@/modules/discovery/comparison-store";

export function CompareNavigationLink({ label = "Compare products" }: { label?: string }) {
  const ids = useComparison();
  return (
    <Link href={comparisonHref(ids)} prefetch={false}>
      {label}
      {ids.length ? ` (${ids.length})` : ""}
    </Link>
  );
}
export function CompareProductButton({ id, name }: { id: string; name: string }) {
  const ids = useComparison(),
    selected = ids.includes(id);
  const [error, setError] = useState("");
  return (
    <div className="product-compare-control">
      <button
        type="button"
        className="text-button"
        aria-label={`Compare ${name}`}
        aria-pressed={selected}
        onClick={() => {
          try {
            setComparisonProduct(id, !selected);
            setError("");
          } catch (failure) {
            setError(
              failure instanceof Error && failure.message.startsWith("Compare up to")
                ? failure.message
                : "Your browser could not save this selection. Allow local storage and try again.",
            );
          }
        }}
      >
        {selected ? "Added to comparison ✓" : "Add to comparison"}
      </button>
      {ids.length ? (
        <Link href={comparisonHref(ids)} prefetch={false}>
          View comparison ({ids.length})
        </Link>
      ) : null}
      {error ? <p role="status">{error}</p> : null}
    </div>
  );
}
export function ComparisonSelection() {
  const ids = useComparison();
  const [error, setError] = useState("");
  return (
    <div className="comparison-selection">
      <p>
        Choose up to four products using “Add to comparison” on a listing. Your selections are
        stored in this browser on this device. Only product IDs are saved.
      </p>
      {ids.length ? (
        <div className="button-row">
          <Link className="button" href={comparisonHref(ids)} prefetch={false}>
            Compare your {ids.length} {ids.length === 1 ? "selection" : "selections"}
          </Link>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              try {
                clearComparison();
                setError("");
              } catch {
                setError("Your browser could not clear these selections.");
              }
            }}
          >
            Clear selections
          </button>
        </div>
      ) : (
        <Link href="/search" className="button">
          Find products to compare
        </Link>
      )}
      {error ? <p role="status">{error}</p> : null}
    </div>
  );
}
export function RemoveComparisonLink({
  id,
  name,
  remaining,
}: {
  id: string;
  name: string;
  remaining: string[];
}) {
  return (
    <Link
      href={comparisonHref(remaining)}
      prefetch={false}
      onClick={() => {
        try {
          setComparisonProduct(id, false);
        } catch {
          /* The URL still removes this selection from the displayed comparison. */
        }
      }}
    >
      Remove {name}
    </Link>
  );
}
