"use client";
import { useState } from "react";
import {
  shopSpecification,
  type ShopSpecification,
  type ShopSpace,
} from "@/modules/shop-design/specification";
type Props = {
  specification: ShopSpecification;
  departments: { id: string; name: string }[];
  products: { id: string; name: string; has_image: boolean }[];
  onChange: (spec: ShopSpecification) => void;
};
export function DesignSections({ specification, departments, products, onChange }: Props) {
  const [type, setType] = useState<ShopSpace["type"]>("entrance"),
    [title, setTitle] = useState("Welcome to our shop"),
    [body, setBody] = useState("Explore our catalogue and contact us with questions."),
    [department, setDepartment] = useState(departments[0]?.id ?? ""),
    [ids, setIds] = useState<string[]>([]),
    [limit, setLimit] = useState(4),
    [kind, setKind] = useState<"all" | "product" | "service">("all"),
    [availability, setAvailability] = useState<"all" | "available">("all"),
    [message, setMessage] = useState("");
  const narrative = ["entrance", "story", "offer", "service_desk"].includes(type),
    curated = ["display", "products", "gallery"].includes(type),
    departmental = type === "department" || type === "collection";
  function add() {
    const id = `section-${crypto.randomUUID().slice(0, 8)}`,
      common = { id, type, version: 1 },
      space = narrative
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
        "Check the title, text and references. The page supports eight sections and 32 product cards; galleries need one to four ready images.",
      );
      return;
    }
    onChange(checked.data);
    setIds([]);
    setMessage("Section added to your unsaved draft. Save and preview before publishing.");
  }
  return (
    <fieldset>
      <legend>Shop sections</legend>
      <p>
        All text is plain text. Offers describe merchant terms; the service desk uses your saved
        contact settings. Choose up to eight sections and 32 cards in total.
      </p>
      {specification.spaces.map((space) => {
        const title =
          "title" in space
            ? typeof space.title === "string"
              ? space.title
              : space.title.text
            : space.type;
        const rich = [
          "hero",
          "featured_product",
          "product_section",
          "department_editorial",
          "commerce_info",
        ].includes(space.type);
        return (
          <fieldset key={space.id}>
            <legend>{title} section</legend>
            {rich ? (
              <p>
                This is a trusted responsive designer section. Its provenance-bearing copy and
                catalogue scope stay intact here; remove it, rearrange it, or ask the design
                assistant for a reviewed replacement.
              </p>
            ) : "title" in space && typeof space.title === "string" ? (
              <label>
                Section title
                <input
                  maxLength={100}
                  value={space.title}
                  onChange={(e) => {
                    const checked = shopSpecification.safeParse({
                      ...specification,
                      spaces: specification.spaces.map((s) =>
                        s.id === space.id ? { ...space, title: e.target.value } : s,
                      ),
                    });
                    if (checked.success) onChange(checked.data);
                  }
                />
              </label>
            ) : null}
            {!rich && "body" in space && typeof space.body === "string" ? (
              <label>
                Section text
                <textarea
                  maxLength={1000}
                  value={space.body}
                  onChange={(e) => {
                    const checked = shopSpecification.safeParse({
                      ...specification,
                      spaces: specification.spaces.map((s) =>
                        s.id === space.id ? { ...space, body: e.target.value } : s,
                      ),
                    });
                    if (checked.success) onChange(checked.data);
                  }
                />
              </label>
            ) : null}
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
          </fieldset>
        );
      })}
      <label htmlFor="new-section-type">New section type</label>
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
          ] as const
        ).map((t) => (
          <option key={t} value={t}>
            {t.replaceAll("_", " ")}
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
            onChange={(e) => setTitle(e.target.value)}
          />
        </>
      ) : null}
      {narrative ? (
        <>
          <label htmlFor="new-section-text">New section text</label>
          <textarea
            id="new-section-text"
            maxLength={1000}
            value={body}
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
            Maximum cards
            <input
              type="number"
              min={1}
              max={8}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
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
            The first 32 current items and existing design references are shown. Archive or reorder
            catalogue items to change this selection.
          </p>
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
