"use client";
import { useState } from "react";
import Link from "next/link";
import type { StorefrontStatus } from "@/modules/storefront-status";

export function ShopPublicLink({
  slug,
  shopId,
  shopName,
  storefront,
  published,
  absoluteBase,
  canDesign = true,
  canManageRent = true,
  canEditAddress = false,
  compact = false,
}: {
  slug: string;
  shopId?: string;
  shopName?: string;
  storefront?: StorefrontStatus;
  published?: boolean;
  absoluteBase?: string;
  canDesign?: boolean;
  canManageRent?: boolean;
  canEditAddress?: boolean;
  compact?: boolean;
}) {
  const path = `/shops/${encodeURIComponent(slug)}`;
  const live = storefront?.public ?? published === true;
  const [status, setStatus] = useState("");
  const next = storefront?.next;
  const canOpenNext = next === "rent" ? canManageRent : next !== "support" && canDesign;
  const setupPath =
    shopId && canOpenNext
      ? `/shopkeeper/shops/${shopId}/${next === "rent" ? "rent" : next === "support" ? "" : "design"}`
      : null;
  async function copyLink() {
    try {
      const url = new URL(path, absoluteBase || window.location.origin).href;
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else {
        const input = document.createElement("textarea");
        input.value = url;
        input.readOnly = true;
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        try {
          input.select();
          if (!document.execCommand("copy")) throw new Error();
        } finally {
          input.remove();
        }
      }
      setStatus("Link copied");
    } catch {
      setStatus("Copy unavailable. Select the address above to copy it.");
    }
  }
  return (
    <section
      className={compact ? "shop-public-link shop-public-link--compact" : "shop-public-link"}
      aria-label="Public shop link"
    >
      {!compact && <h2>Your storefront address</h2>}
      <p className="storefront-label">
        <span
          className={live ? "storefront-dot storefront-dot--live" : "storefront-dot"}
          aria-hidden="true"
        />
        {storefront?.label ?? (live ? "Live on the mall" : "Not published yet")}
      </p>
      {!compact && (
        <p>
          {storefront?.detail ??
            (live
              ? `Share ${shopName || "your shop"} with customers.`
              : "Save a design and publish your shop before sharing this address.")}
        </p>
      )}
      <div className="shop-public-link__row">
        <code className="shop-public-link__path">
          {absoluteBase ? new URL(path, absoluteBase).href : path}
        </code>
      </div>
      <div className="shop-public-link__actions">
        {live ? (
          <>
            <Link href={path} prefetch={false}>
              Open public shop ↗
            </Link>
            <button type="button" className="button button--small" onClick={copyLink}>
              Copy link
            </button>
          </>
        ) : setupPath ? (
          <Link href={setupPath}>
            {next === "rent"
              ? "Review rent status"
              : next === "support"
                ? "Review shop status"
                : "Set up & publish"}{" "}
            →
          </Link>
        ) : null}
        {!compact && shopId && canEditAddress ? (
          <Link href={`/shopkeeper/shops/${shopId}/address`}>Edit address</Link>
        ) : null}
      </div>
      {status ? (
        <p role="status" className="shop-public-link__status">
          {status}
        </p>
      ) : null}
    </section>
  );
}
