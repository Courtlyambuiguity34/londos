"use client";
import { useState } from "react";
import Link from "next/link";
import { sectionLabels, layoutLabels } from "@/modules/merchant-editor";
import { distinctShopSections } from "@/modules/shop-themes/sections";
import {
  shopSpecification,
  type ShopSpecification,
  type ShopSpace,
} from "@/modules/shop-design/specification";
type Props = {
  specification: ShopSpecification;
  departments: { id: string; name: string; slug?: string }[];
  shopId?: string;
  revision?: number | null;
  canPreview?: boolean;
  canManageCatalogue?: boolean;
  products: { id: string; name: string; has_image: boolean }[];
  onChange: (spec: ShopSpecification) => void;
};
function sectionText(
  space: ShopSpace,
  field: "title" | "body" | "subtitle",
  value: string,
): ShopSpace {
  switch (space.type) {
    case "hero":
      return field === "title"
        ? { ...space, title: { text: value, provenance: "merchant" } }
        : field === "subtitle"
          ? { ...space, subtitle: value ? { text: value, provenance: "merchant" } : null }
          : space;
    case "featured_product":
    case "product_section":
      return field === "title"
        ? { ...space, title: { text: value, provenance: "merchant" } }
        : space;
    case "department_editorial":
      return field === "title"
        ? { ...space, title: { text: value, provenance: "merchant" } }
        : field === "body"
          ? { ...space, body: { text: value, provenance: "merchant" } }
          : space;
    default:
      if (field === "title" && "title" in space) return { ...space, title: value };
      if (field === "body" && "body" in space) return { ...space, body: value };
      return space;
  }
}
export function DesignSections({
  specification,
  departments,
  products,
  onChange,
  shopId,
  revision,
  canPreview = false,
  canManageCatalogue = false,
}: Props) {
  const [type, setType] = useState<ShopSpace["type"]>("entrance"),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [department, setDepartment] = useState(departments[0]?.id ?? ""),
    [ids, setIds] = useState<string[]>([]),
    [limit, setLimit] = useState(4),
    [kind, setKind] = useState<"all" | "product" | "service">("all"),
    [availability, setAvailability] = useState<"all" | "available">("all"),
    [message, setMessage] = useState("");
  const editText = (id: string, field: "title" | "body" | "subtitle", value: string) =>
    onChange({
      ...specification,
      spaces: specification.spaces.map((space) =>
        space.id === id ? sectionText(space, field, value) : space,
      ),
    });
  const narrative = ["entrance", "story", "offer", "service_desk", "hero"].includes(type),
    curated = ["display", "products", "gallery", "product_section"].includes(type),
    departmental = type === "department" || type === "collection";
  function add() {
    const id = `section-${crypto.randomUUID().slice(0, 8)}`,
      common = { id, type, version: 1 },
      space =
        type === "hero"
          ? {
              ...common,
              variant: "split",
              title: { text: title, provenance: "merchant" },
              subtitle: body ? { text: body, provenance: "merchant" } : null,
              featuredProductId: null,
              cta: "browse",
            }
          : type === "product_section"
            ? {
                ...common,
                variant: "grid",
                title: { text: title, provenance: "merchant" },
                departmentId: null,
                productIds: ids,
              }
            : type === "commerce_info"
              ? { ...common, variant: "summary" }
              : narrative
                ? { ...common, title, body }
                : curated
                  ? { ...common, title, productIds: ids }
                  : departmental
                    ? {
                        ...common,
                        departmentId: department,
                        limit,
                        ...(type === "collection" ? { title, kind, availability } : {}),
                      }
                    : common;
    const checked = shopSpecification.safeParse({
      ...specification,
      spaces: [...specification.spaces, space],
    });
    if (!checked.success) {
      setMessage(
        "Choose a heading and select the products or department this section needs. The page supports eight sections and 32 product cards; galleries need one to four ready images.",
      );
      return;
    }
    if (distinctShopSections(checked.data.spaces).length !== checked.data.spaces.length) {
      setMessage("This section is already on your page. Edit the existing section instead.");
      return;
    }
    onChange(checked.data);
    setIds([]);
    setTitle("");
    setBody("");
    setMessage("Section added to your unsaved draft. Save and preview before publishing.");
  }
  return (
    <fieldset>
      <legend>Sections on your shop home page</legend>
      <p>
        Arrange your welcome message, story, products and contact details here. These sections
        appear together on your shop home page. Department and product links open their own pages.
        You can add up to eight sections and show up to 32 products on the home page.
      </p>
      {specification.spaces.map((space, index) => {
        const title =
          "title" in space
            ? typeof space.title === "string"
              ? space.title
              : space.title.text
            : "departmentId" in space
              ? (departments.find((d) => d.id === space.departmentId)?.name ??
                sectionLabels[space.type])
              : sectionLabels[space.type];
        const rich = [
          "hero",
          "featured_product",
          "product_section",
          "department_editorial",
          "commerce_info",
        ].includes(space.type);
        return (
          <details className="editor-section-card" key={space.id}>
            <summary>
              <span className="editor-section-number">{index + 1}</span>
              <span>
                <strong>{title}</strong>
                <small>{sectionLabels[space.type]}</small>
              </span>
              <span className="editor-section-edit">Edit</span>
            </summary>
            <fieldset>
              <legend className="sr-only">{title} section</legend>
              {"title" in space ? (
                <label>
                  Section title
                  <input
                    aria-label="Section title"
                    maxLength={100}
                    value={typeof space.title === "string" ? space.title : space.title.text}
                    onChange={(event) => editText(space.id, "title", event.target.value)}
                  />
                </label>
              ) : null}
              {"body" in space ? (
                <label>
                  Section text
                  <textarea
                    aria-label="Section text"
                    maxLength={typeof space.body === "string" ? 1000 : 240}
                    value={typeof space.body === "string" ? space.body : space.body.text}
                    onChange={(event) => editText(space.id, "body", event.target.value)}
                  />
                </label>
              ) : space.type === "hero" ? (
                <label>
                  Section text
                  <textarea
                    aria-label="Section text"
                    maxLength={240}
                    value={space.subtitle?.text ?? ""}
                    onChange={(event) => editText(space.id, "subtitle", event.target.value)}
                  />
                </label>
              ) : null}
              {rich ? (
                <>
                  {"variant" in space ? (
                    <label>
                      Section layout
                      <select
                        aria-label="Section layout"
                        value={space.variant}
                        onChange={(event) =>
                          onChange({
                            ...specification,
                            spaces: specification.spaces.map((item) =>
                              item.id === space.id
                                ? ({ ...item, variant: event.target.value } as ShopSpace)
                                : item,
                            ),
                          })
                        }
                      >
                        {(
                          {
                            hero: ["editorial", "split", "product_led"],
                            featured_product: ["spotlight", "split", "compact"],
                            product_section: ["editorial", "grid", "carousel"],
                            department_editorial: ["editorial", "split", "compact"],
                            commerce_info: ["summary", "split"],
                          } as Record<string, string[]>
                        )[space.type]?.map((variant) => (
                          <option key={variant} value={variant}>
                            {layoutLabels[variant] ?? variant}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <p className="editor-hint">
                    Choose how this part looks. Your selected products and department stay the same.
                  </p>
                </>
              ) : null}
              {space.type === "department" || space.type === "collection" ? (
                <>
                  <label>
                    Department to display
                    <select
                      aria-label="Department to display"
                      value={space.departmentId}
                      onChange={(event) =>
                        onChange({
                          ...specification,
                          spaces: specification.spaces.map((item) =>
                            item.id === space.id
                              ? { ...space, departmentId: event.target.value }
                              : item,
                          ),
                        })
                      }
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Products shown here
                    <select
                      aria-label="Products shown here"
                      value={space.limit}
                      onChange={(event) =>
                        onChange({
                          ...specification,
                          spaces: specification.spaces.map((item) =>
                            item.id === space.id
                              ? { ...space, limit: Number(event.target.value) }
                              : item,
                          ),
                        })
                      }
                    >
                      {Array.from({ length: 8 }, (_, index) => (
                        <option key={index + 1} value={index + 1}>
                          Show up to {index + 1} {index === 0 ? "product" : "products"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="editor-hint">
                    Customers can select this department to see its full page, then open any product
                    for details.
                  </p>
                  {(() => {
                    const d = departments.find((item) => item.id === space.departmentId);
                    return canPreview && shopId && revision && d?.slug ? (
                      <Link
                        className="text-button"
                        prefetch={false}
                        href={`/shopkeeper/shops/${shopId}/preview?revision=${revision}&department=${encodeURIComponent(d.slug)}`}
                      >
                        Preview {d.name} page →
                      </Link>
                    ) : (
                      <p className="editor-hint">
                        Save your draft to preview this department page.
                      </p>
                    );
                  })()}
                </>
              ) : null}
              <div className="editor-section-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={index === 0}
                  onClick={() => {
                    const spaces = [...specification.spaces];
                    [spaces[index - 1], spaces[index]] = [spaces[index]!, spaces[index - 1]!];
                    onChange({ ...specification, spaces });
                  }}
                >
                  Move {title} up
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={index === specification.spaces.length - 1}
                  onClick={() => {
                    const spaces = [...specification.spaces];
                    [spaces[index + 1], spaces[index]] = [spaces[index]!, spaces[index + 1]!];
                    onChange({ ...specification, spaces });
                  }}
                >
                  Move {title} down
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    onChange({
                      ...specification,
                      spaces: specification.spaces.filter((s) => s.id !== space.id),
                    })
                  }
                >
                  Remove {title} section
                </button>
              </div>
            </fieldset>
          </details>
        );
      })}
      <h3>Add something to your home page</h3>
      <label htmlFor="new-section-type">What would you like to add?</label>
      <select
        id="new-section-type"
        value={type}
        onChange={(e) => {
          setType(e.target.value as ShopSpace["type"]);
          setIds([]);
        }}
      >
        {(
          [
            "entrance",
            "display",
            "department",
            "collection",
            "story",
            "offer",
            "contact",
            "service_desk",
            "gallery",
            "hero",
            "product_section",
            "commerce_info",
          ] as const
        ).map((t) => (
          <option key={t} value={t}>
            {sectionLabels[t]}
          </option>
        ))}
      </select>
      {narrative || curated || type === "collection" ? (
        <>
          <label htmlFor="new-section-title">New section title</label>
          <input
            id="new-section-title"
            maxLength={100}
            value={title}
            placeholder="A short heading in your own words"
            onChange={(e) => setTitle(e.target.value)}
          />
        </>
      ) : null}
      {narrative ? (
        <>
          <label htmlFor="new-section-text">New section text</label>
          <textarea
            id="new-section-text"
            maxLength={type === "hero" ? 240 : 1000}
            value={body}
            placeholder="Tell customers something useful about your shop"
            onChange={(e) => setBody(e.target.value)}
          />
        </>
      ) : null}
      {departmental ? (
        <>
          <label htmlFor="section-department">Section department</label>
          <select
            id="section-department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <label>
            Products shown here
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              {Array.from({ length: 8 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  Show up to {index + 1} {index === 0 ? "product" : "products"}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      {type === "collection" ? (
        <>
          <label htmlFor="collection-kind">Collection kind</label>
          <select
            id="collection-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="all">Products and services</option>
            <option value="product">Products</option>
            <option value="service">Services</option>
          </select>
          <label htmlFor="collection-availability">Collection availability</label>
          <select
            id="collection-availability"
            value={availability}
            onChange={(e) => setAvailability(e.target.value as typeof availability)}
          >
            <option value="all">All current items</option>
            <option value="available">Available items</option>
          </select>
        </>
      ) : null}
      {curated ? (
        <fieldset>
          <legend>
            Choose catalogue items (
            {type === "gallery" ? "up to four with ready images" : "up to eight"})
          </legend>
          <p>
            Choose products you have already added to your shop. This selection shows your first 32
            current items and products already used in your design.
          </p>
          {shopId && canManageCatalogue ? (
            <Link className="text-button" href={`/shopkeeper/shops/${shopId}/catalogue#products`}>
              Add another product →
            </Link>
          ) : null}
          {products
            .filter((p) => type !== "gallery" || p.has_image)
            .map((p) => (
              <label key={p.id} className="check-label">
                <input
                  type="checkbox"
                  checked={ids.includes(p.id)}
                  disabled={!ids.includes(p.id) && ids.length >= (type === "gallery" ? 4 : 8)}
                  onChange={(e) =>
                    setIds(e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id))
                  }
                />
                {p.name}
              </label>
            ))}
        </fieldset>
      ) : null}
      <button
        type="button"
        className="button button--outline"
        disabled={specification.spaces.length >= 8}
        onClick={add}
      >
        Add section
      </button>
      <p aria-live="polite">{message}</p>
    </fieldset>
  );
}
