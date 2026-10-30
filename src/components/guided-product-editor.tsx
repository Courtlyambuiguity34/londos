"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ProductPhotoPicker, type PhotoAsset } from "./product-photo-picker";
import { catalogueAddress, editablePrice, priceToMinor } from "@/modules/merchant-editor";
import { formatMinorMoney } from "@/modules/money";
type Seed = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  description: string;
  currency: string;
  price_minor: string | null;
  availability: string;
  department_id: string;
  position: number;
  version: number;
  media_id: string | null;
};
type Department = { id: string; name: string; archived: boolean; position: number };
export function GuidedProductEditor({
  shopId,
  departments: initialDepartments,
  photos: initialPhotos,
  product: seed,
  nextPosition: initialPosition,
  initialDepartmentId,
}: {
  shopId: string;
  departments: Department[];
  photos: PhotoAsset[];
  product: Seed | null;
  nextPosition: number;
  initialDepartmentId?: string | undefined;
}) {
  const base = `/shopkeeper/shops/${shopId}`,
    root = `/api/workspace/shops/${shopId}`,
    defaultDepartment =
      seed?.department_id ??
      initialDepartmentId ??
      initialDepartments.find((d) => !d.archived)?.id ??
      "";
  const [step, setStep] = useState(1),
    [name, setName] = useState(seed?.name ?? ""),
    [kind, setKind] = useState(seed?.kind ?? "product"),
    [department, setDepartment] = useState(defaultDepartment),
    [departments, setDepartments] = useState(initialDepartments),
    [currency, setCurrency] = useState(seed?.currency ?? "UGX"),
    [price, setPrice] = useState(editablePrice(seed?.price_minor ?? null, seed?.currency ?? "UGX")),
    [description, setDescription] = useState(seed?.description ?? ""),
    [slug, setSlug] = useState(seed?.slug ?? ""),
    [hidden, setHidden] = useState(seed?.availability === "archived"),
    [availability, setAvailability] = useState(
      seed?.availability === "unavailable" ? "unavailable" : "available",
    ),
    [image, setImage] = useState(seed?.media_id ?? ""),
    [photos, setPhotos] = useState(initialPhotos),
    [photoBusy, setPhotoBusy] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [newDepartment, setNewDepartment] = useState(""),
    [newLink, setNewLink] = useState(""),
    [productId, setProductId] = useState(seed?.id ?? null),
    [version, setVersion] = useState(seed?.version ?? 0),
    [position, setPosition] = useState(seed?.position ?? initialPosition),
    [generation, setGeneration] = useState(0),
    [saved, setSaved] = useState(false),
    [baseline, setBaseline] = useState(() =>
      JSON.stringify([
        seed?.name ?? "",
        seed?.kind ?? "product",
        defaultDepartment,
        seed?.currency ?? "UGX",
        editablePrice(seed?.price_minor ?? null, seed?.currency ?? "UGX"),
        seed?.description ?? "",
        seed?.slug ?? "",
        seed?.availability === "archived",
        seed?.availability === "unavailable" ? "unavailable" : "available",
        seed?.media_id ?? "",
      ]),
    );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step, saved]);
  const dirty =
    !saved &&
    JSON.stringify([
      name,
      kind,
      department,
      currency,
      price,
      description,
      slug,
      hidden,
      availability,
      image,
    ]) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    const leave = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      )
        return;
      const destination = new URL(link.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.href.split("#")[0] === window.location.href.split("#")[0]) return;
      if (
        !window.confirm(
          "Leave product setup? Your unsaved product details will be cleared. Uploaded photos remain in Images.",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leave, true);
    };
  }, [dirty]);
  async function write(path: string, value: unknown) {
    const response = await fetch(root + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(
        (
          {
            product_photo_required:
              "Add a ready photo before showing this product, or save it hidden for later.",
            photo_not_ready:
              "This photo is not ready for use. Choose a ready photo or check preparation again before saving.",
            stale_version:
              "This product changed in another session. Reload its current version before saving.",
            department_name_in_use:
              "This department already exists. Select it above or choose a different name.",
            slug_in_use:
              "This link is already used in this shop. Choose another link under More details.",
            resource_unavailable:
              "The selected product, department or photo is no longer available. Check your selections.",
          } as Record<string, string>
        )[result.error] ?? "The change was not confirmed. Your entered details are still here.",
      );
    return result;
  }
  async function createDepartment() {
    setBusy(true);
    setMessage("");
    try {
      const address = newLink.trim() || catalogueAddress(newDepartment);
      if (!newDepartment.trim() || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(address) || address.length > 80)
        throw Error("Enter a department name and a readable link using letters and numbers.");
      const result = await write("/departments", {
        name: newDepartment,
        slug: address,
        position: Math.min(1000000, Math.max(-1, ...departments.map((d) => d.position)) + 1),
        archived: false,
        version: 0,
      });
      setDepartments([
        ...departments,
        {
          id: result.id,
          name: newDepartment.trim(),
          archived: false,
          position: departments.length,
        },
      ]);
      setDepartment(result.id);
      setNewDepartment("");
      setNewLink("");
      setMessage("Department created and selected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Department not confirmed.");
    } finally {
      setBusy(false);
    }
  }
  function next() {
    setMessage("");
    if (step === 1 && !name.trim()) {
      setMessage("Give this product or service a name.");
      return;
    }
    if (step === 1 && kind === "product" && !image && !hidden) {
      setMessage("Add a photo, or choose “Add the photo later” to keep this product hidden.");
      return;
    }
    if (step === 2) {
      if (!department) {
        setMessage("Choose or create a department.");
        return;
      }
      const address = slug.trim() || catalogueAddress(name);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(address) || address.length > 80) {
        setMessage(
          "Enter a product link under More details using letters a–z, numbers and single hyphens.",
        );
        return;
      }
      try {
        priceToMinor(price, currency);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Check the price.");
        return;
      }
    }
    setStep(step + 1);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) {
      next();
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await write("/products/guided", {
        productId,
        name,
        slug: slug.trim() || catalogueAddress(name),
        kind,
        description,
        currency,
        priceMinor: priceToMinor(price, currency),
        availability: hidden ? "archived" : availability,
        departmentId: department,
        mediaId: image || null,
        position,
        version,
      });
      setSaved(true);
      setMessage(
        hidden
          ? "Saved privately. Add a photo and make it visible when ready."
          : "Product saved with your selected details.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The product was not confirmed.");
    } finally {
      setBusy(false);
    }
  }
  if (saved)
    return (
      <section className="workspace-panel guided-product-success">
        <h2 ref={heading} tabIndex={-1}>
          {hidden ? "Saved for later" : "Your product is saved"}
        </h2>
        <p>{message}</p>
        <p>
          {hidden
            ? "Customers cannot see this hidden listing."
            : "Your shop’s existing publication status controls whether customers can see it."}
        </p>
        <div className="button-row">
          <button
            className="button"
            onClick={() => {
              setName("");
              setDescription("");
              setPrice("");
              setSlug("");
              setImage("");
              setHidden(false);
              setAvailability("available");
              setBaseline(
                JSON.stringify([
                  "",
                  kind,
                  department,
                  currency,
                  "",
                  "",
                  "",
                  false,
                  "available",
                  "",
                ]),
              );
              setProductId(null);
              setVersion(0);
              setPosition(Math.max(position + 1, initialPosition));
              setGeneration((g) => g + 1);
              setSaved(false);
              setStep(1);
              setMessage("");
              void fetch(`${root}/media`)
                .then((r) => (r.ok ? r.json() : initialPhotos))
                .then(setPhotos)
                .catch(() => {});
            }}
          >
            Add another product
          </button>
          <Link href={base}>Check shop setup</Link>
          <Link href={`${base}/catalogue`}>Manage catalogue</Link>
        </div>
      </section>
    );
  return (
    <section className="workspace-panel guided-product">
      <ol className="guided-progress" aria-label="Product setup progress">
        {["Photo & name", "Details", "Review & save"].map((label, index) => (
          <li key={label} aria-current={step === index + 1 ? "step" : undefined}>
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      <form method="post" onSubmit={submit} className="account-form">
        {step === 1 ? (
          <>
            <h2 ref={heading} tabIndex={-1}>
              Let shoppers see what you sell
            </h2>
            <label htmlFor="guided-name">Product or service name</label>
            <input
              id="guided-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={160}
            />
            <label htmlFor="guided-kind">What are you adding?</label>
            <select id="guided-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="product">A product</option>
              <option value="service">A service</option>
            </select>
            <ProductPhotoPicker
              key={generation}
              shopId={shopId}
              initialId={image}
              assets={photos}
              onPending={setPhotoBusy}
              onSelected={setImage}
            />
            {kind === "service" ? (
              <p>A photo is optional for a service. It can help explain what you offer.</p>
            ) : (
              <p>
                A visible product needs a photo. Its department uses product photos for its
                thumbnail too.
              </p>
            )}
            {!image && kind === "product" ? (
              <button
                type="button"
                className="text-button"
                disabled={photoBusy || busy}
                onClick={() => {
                  setHidden(true);
                  setMessage(
                    "This product will stay hidden until you add a photo and choose to show it.",
                  );
                  if (name.trim()) setStep(2);
                }}
              >
                Add the photo later
              </button>
            ) : null}
          </>
        ) : null}
        {step === 2 ? (
          <>
            <h2 ref={heading} tabIndex={-1}>
              A few useful details
            </h2>
            <label htmlFor="guided-department">Department</label>
            <select
              id="guided-department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              required
            >
              <option value="">Choose a department</option>
              {departments
                .filter((d) => !d.archived)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
            <details open={!departments.some((d) => !d.archived)}>
              <summary>Create a department here</summary>
              <label htmlFor="guided-new-department">New department name</label>
              <input
                id="guided-new-department"
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                maxLength={120}
              />
              <details>
                <summary>Department link (optional)</summary>
                <label htmlFor="guided-new-link">New department link</label>
                <input
                  id="guided-new-link"
                  value={newLink}
                  onChange={(e) => setNewLink(e.target.value)}
                  maxLength={80}
                />
              </details>
              <button
                type="button"
                className="button button--small"
                disabled={busy || !newDepartment.trim()}
                onClick={() => void createDepartment()}
              >
                Create & select department
              </button>
            </details>
            <label htmlFor="guided-currency">Currency</label>
            <select
              id="guided-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {["UGX", "USD", "KES", "EUR", "GBP"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <label htmlFor="guided-price">Price (optional)</label>
            <input
              id="guided-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              maxLength={23}
            />
            <p>
              Leave blank for “Ask for price”. Enter amounts without commas; use whole shillings for
              UGX.
            </p>
            <details>
              <summary>More details (optional)</summary>
              <label htmlFor="guided-description">Description</label>
              <textarea
                id="guided-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
              />
              <label htmlFor="guided-slug">Product link</label>
              <input
                id="guided-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Made from the name"
                maxLength={80}
              />
            </details>
          </>
        ) : null}
        {step === 3 ? (
          <>
            <h2 ref={heading} tabIndex={-1}>
              Check {name}
            </h2>
            <dl className="lifecycle-summary">
              <dt>Price</dt>
              <dd>
                {(() => {
                  try {
                    return formatMinorMoney(priceToMinor(price, currency), currency);
                  } catch {
                    return "Check price";
                  }
                })()}
              </dd>
              <dt>Department</dt>
              <dd>{departments.find((d) => d.id === department)?.name}</dd>
              <dt>Photo</dt>
              <dd>{image ? "Photo selected" : "No photo selected"}</dd>
            </dl>
            <label className="check-label">
              <input
                type="checkbox"
                checked={hidden}
                onChange={(e) => setHidden(e.target.checked)}
              />
              Keep this listing hidden for now
            </label>
            {!hidden ? (
              <>
                <label htmlFor="guided-availability">Availability</label>
                <select
                  id="guided-availability"
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                >
                  <option value="available">Available</option>
                  <option value="unavailable">Currently unavailable</option>
                </select>
              </>
            ) : null}
            {!image && kind === "product" && !hidden ? (
              <p role="alert">Add a photo in step 1, or keep this product hidden before saving.</p>
            ) : null}
          </>
        ) : null}
        <div className="button-row">
          {step > 1 ? (
            <button
              type="button"
              className="button button--outline"
              disabled={busy}
              onClick={() => {
                setStep(step - 1);
                setMessage("");
              }}
            >
              Back
            </button>
          ) : null}
          <button
            className="button"
            disabled={busy || photoBusy || (step === 3 && kind === "product" && !image && !hidden)}
          >
            {busy
              ? "Saving…"
              : step === 3
                ? hidden
                  ? "Save hidden for later"
                  : "Save product"
                : "Continue"}
          </button>
        </div>
        <p role="status" aria-label="Product setup status">
          {message}
        </p>
      </form>
      <noscript>
        <p>
          Product setup requires JavaScript for photo upload and saving. You can still view your
          existing shop and contact Londos for help.
        </p>
      </noscript>
    </section>
  );
}
