"use client";
import { useState, type CSSProperties } from "react";
import { shopThemes, applyShopTheme, themeStyle } from "@/modules/shop-themes/catalogue";
import type { ShopSpecification } from "@/modules/shop-design/specification";
import { ReadyImage } from "./ready-image";
import type { BrandingImage } from "./shop-branding-fields";

export function ShopThemePicker({
  spec,
  onChange,
  disabled,
  images,
  shopId,
}: {
  spec: ShopSpecification;
  onChange: (spec: ShopSpecification) => void;
  disabled: boolean;
  images: BrandingImage[];
  shopId: string;
}) {
  const [category, setCategory] = useState("all");
  const image = images.find((image) => image.id === spec.branding?.coverAssetId) ?? images[0];
  return (
    <div className="theme-library">
      <div className="editor-section-heading">
        <div>
          <p className="eyebrow">Make it yours</p>
          <h2>A good shop deserves a great storefront.</h2>
          <p>
            Choose a starting point, then make it your own. Your catalogue, images and writing stay
            yours.
          </p>
        </div>
        <label>
          Theme category
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All themes</option>
            {[...new Set(shopThemes.map((theme) => theme.category))].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="theme-library-grid">
        {shopThemes
          .filter((theme) => category === "all" || theme.category === category)
          .map((theme) => (
            <article
              key={theme.id}
              className="theme-choice"
              data-selected={spec.storefrontTheme === theme.id}
            >
              <div
                className={`theme-miniature miniature-${theme.layout.hero}`}
                style={themeStyle(theme) as CSSProperties}
                aria-hidden="true"
              >
                <div className="miniature-nav">
                  <strong>Your shop</strong>
                  <span>Shop · Collections</span>
                </div>
                <div className="miniature-hero">
                  <div>
                    <small>{theme.name} collection</small>
                    <strong>{theme.tagline}</strong>
                    <span className="miniature-button">Explore the shop →</span>
                  </div>
                  <div className="miniature-photo">
                    {image ? (
                      <ReadyImage
                        shopId={shopId}
                        assetId={image.id}
                        alt=""
                        width={image.width}
                        height={image.height}
                        privatePreview
                      />
                    ) : (
                      <span className="miniature-shape" />
                    )}
                  </div>
                </div>
                <div className="miniature-products">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="theme-choice-body">
                <div>
                  <h3>{theme.name}</h3>
                  <span>{theme.category}</span>
                </div>
                <p>{theme.description}</p>
                <button
                  type="button"
                  className={
                    spec.storefrontTheme === theme.id ? "button button--outline" : "button"
                  }
                  disabled={disabled}
                  onClick={() => onChange(applyShopTheme(spec, theme.id))}
                >
                  {spec.storefrontTheme === theme.id
                    ? `Selected: ${theme.name}`
                    : `Use ${theme.name}`}
                </button>
              </div>
            </article>
          ))}
      </div>
      <p className="editor-hint">
        Selecting a theme changes your unsaved draft. Save and preview before you publish. Fine-tune
        colours, spacing and type in Style.
      </p>
      {spec.storefrontTheme ? (
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() => {
            const custom = { ...spec };
            delete custom.storefrontTheme;
            onChange(custom);
          }}
        >
          Use my own layout styling
        </button>
      ) : null}
    </div>
  );
}
