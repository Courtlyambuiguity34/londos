"use client";
import { useRef } from "react";
import Link from "next/link";
import { categories } from "@/modules/catalogue/fixtures";

// Native disclosure remains usable before hydration and without JavaScript.
export function MobileNavigation({
  showShopkeeper,
  showLandlord = false,
  showRentCta = true,
}: {
  showShopkeeper: boolean;
  showLandlord?: boolean;
  showRentCta?: boolean;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  return (
    <details
      className="mobile-navigation"
      ref={details}
      onKeyDown={(event) => {
        if (event.key === "Escape" && details.current?.open) {
          event.preventDefault();
          details.current.open = false;
          details.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary>Menu</summary>
      <nav
        aria-label="Mobile navigation"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a") && details.current)
            details.current.open = false;
        }}
      >
        <Link href="/search">Explore shops</Link>
        <Link href="/saved">Saved shops</Link>
        <Link href="/about">Our mall</Link>
        <Link href="/help">How to shop</Link>
        {showRentCta ? <Link href="/rent-a-shop">Open your shop</Link> : null}
        {showShopkeeper ? <Link href="/shopkeeper">Shopkeeper</Link> : null}
        {showLandlord ? <Link href="/landlord">Management</Link> : null}
        {!showShopkeeper && !showLandlord ? <Link href="/sign-in">Sign in</Link> : null}
        <p className="mobile-navigation-title">Categories</p>
        <div className="mobile-category-links">
          {categories.map((category) => (
            <Link key={category.slug} href={`/categories/${category.slug}`}>
              {category.name}
            </Link>
          ))}
        </div>
      </nav>
    </details>
  );
}
