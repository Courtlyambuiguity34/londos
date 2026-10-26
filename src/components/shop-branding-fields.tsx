"use client";
import Link from "next/link";
import type { ShopSpecification } from "@/modules/shop-design/specification";
import { ReadyImage } from "./ready-image";

export type BrandingImage = { id: string; alt: string; width: number; height: number };
export function ShopBrandingFields({
  shopId,
  images,
  spec,
  onChange,
  disabled,
  canManageImages,
}: {
  shopId: string;
  images: BrandingImage[];
  spec: ShopSpecification;
  onChange: (spec: ShopSpecification) => void;
  disabled: boolean;
  canManageImages: boolean;
}) {
  return (
    <fieldset className="shop-branding-fields" disabled={disabled}>
      <legend>Cover image &amp; logo</legend>
      <p>
        Your cover appears in the mall’s shop list and at the top of your shop. Save the draft,
        preview it, then publish to update the main site.
      </p>
      <div className="shop-branding-grid">
        {(
          [
            ["coverAssetId", "Shop cover image"],
            ["logoAssetId", "Shop logo"],
          ] as const
        ).map(([key, label]) => {
          const selected = images.find((image) => image.id === spec.branding?.[key]);
          return (
            <div key={key}>
              <label htmlFor={`branding-${key}`}>{label}</label>
              <select
                id={`branding-${key}`}
                value={spec.branding?.[key] ?? ""}
                onChange={(event) =>
                  onChange({
                    ...spec,
                    branding: {
                      coverAssetId: spec.branding?.coverAssetId ?? null,
                      logoAssetId: spec.branding?.logoAssetId ?? null,
                      [key]: event.target.value || null,
                    },
                  })
                }
              >
                <option value="">
                  {key === "coverAssetId" ? "Use a product image on the mall list" : "No logo"}
                </option>
                {images.map((image) => (
                  <option value={image.id} key={image.id}>
                    {image.alt}
                  </option>
                ))}
              </select>
              {selected ? (
                <div
                  className={
                    key === "coverAssetId" ? "branding-cover-preview" : "branding-logo-preview"
                  }
                >
                  <ReadyImage
                    shopId={shopId}
                    assetId={selected.id}
                    alt={selected.alt}
                    width={selected.width}
                    height={selected.height}
                    privatePreview
                  />
                </div>
              ) : (
                <p className="branding-hint">
                  {key === "coverAssetId"
                    ? "Without a selected cover, the mall uses a ready image assigned to a visible product."
                    : "A square image works well as a logo."}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {canManageImages ? (
        <Link href={`/shopkeeper/shops/${shopId}/catalogue#images`}>
          Upload or manage shop images →
        </Link>
      ) : (
        <p>
          Ask a catalogue editor to upload images for this shop. You can select ready images here.
        </p>
      )}
      {!images.length ? (
        <p>
          No ready images yet. Upload an image and allow processing to finish, then reload this
          designer.
        </p>
      ) : null}
    </fieldset>
  );
}
