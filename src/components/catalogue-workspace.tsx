"use client";
import Image from "next/image";
import { CatalogueHistory } from "./catalogue-history";
import Link from "next/link";
import { WorkspaceSectionNav, useWorkspaceSection } from "./workspace-sections";
import { formatMinorMoney } from "@/modules/money";
import { catalogueAddress, priceToMinor, editablePrice } from "@/modules/merchant-editor";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { PhotoHealth } from "@/server/shop-photo-health";

type Department = {
  id: string;
  name: string;
  slug: string;
  position: number;
  archived: boolean;
  version: number;
};
type Product = {
  id: string;
  department_id: string;
  kind: string;
  name: string;
  slug: string;
  description: string;
  currency: string;
  price_minor: string | null;
  availability: string;
  position: number;
  version: number;
  media_id: string | null;
};
type Media = {
  id: string;
  state: string;
  version: number;
  alt: string;
  width: number | null;
  height: number | null;
  error_code: string | null;
};
type Contacts = {
  version: number;
  phone: string;
  whatsapp: string;
  website: string;
  fulfilment: string;
  payment_instructions: string;
  delivery_instructions: string;
  enquiries_enabled: boolean;
};
type CustomerRequest = {
  id: string;
  kind: string;
  name: string;
  reply_to: string;
  erased_at?: string | null;
  message: string;
  status: string;
  version: number;
  product_name?: string | null;
  product_slug?: string | null;
};
const catalogueSections = [
  { id: "products", label: "Products", description: "Your catalogue" },
  { id: "departments", label: "Departments", description: "Organise collections" },
  { id: "images", label: "Images", description: "Photo library" },
  { id: "contacts", label: "Contact settings", description: "How customers reach you" },
  { id: "history", label: "History & deleted items", description: "30-day recovery" },
  { id: "requests", label: "Customer requests", description: "Your inbox" },
] as const;
const blankContacts: Contacts = {
  version: 0,
  phone: "",
  whatsapp: "",
  website: "",
  fulfilment: "contact",
  payment_instructions: "",
  delivery_instructions: "",
  enquiries_enabled: false,
};
const field = (data: FormData, key: string) => String(data.get(key) ?? "");
export function CatalogueWorkspace({
  shopId,
  canDesign = false,
}: {
  shopId: string;
  canDesign?: boolean;
}) {
  const { active, select } = useWorkspaceSection(catalogueSections, "products");
  const root = `/api/workspace/shops/${shopId}`;
  const [departments, setDepartments] = useState<Department[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [media, setMedia] = useState<Media[]>([]),
    [contacts, setContacts] = useState<Contacts>(blankContacts),
    [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [offset, setOffset] = useState(0),
    [more, setMore] = useState(false),
    [requestOffset, setRequestOffset] = useState(0),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [department, setDepartment] = useState<Department | null>(null),
    [product, setProduct] = useState<Product | null>(null),
    [preferredDepartment, setPreferredDepartment] = useState("");
  const [copy, setCopy] = useState<Product | null>(null),
    [productFormKey, setProductFormKey] = useState(0),
    [productDirty, setProductDirty] = useState(false),
    [entryDefaults, setEntryDefaults] = useState({ currency: "UGX", kind: "product" }),
    [quickDepartment, setQuickDepartment] = useState(false),
    [quickDepartmentName, setQuickDepartmentName] = useState(""),
    [quickDepartmentSlug, setQuickDepartmentSlug] = useState(""),
    [nextProductPosition, setNextProductPosition] = useState(0),
    [filters, setFilters] = useState({ query: "", departmentId: "", availability: "all" });
  const editValues = product ?? copy;
  const [photoHealth, setPhotoHealth] = useState<PhotoHealth | null>(null);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const results = await Promise.all([
        fetch(
          `${root}/catalogue?${new URLSearchParams({ offset: String(offset), q: filters.query, department: filters.departmentId, availability: filters.availability })}`,
          { signal: signal ?? null },
        ),
        fetch(`${root}/media`, { signal: signal ?? null }),
        fetch(`${root}/contacts`, { signal: signal ?? null }),
        fetch(`${root}/requests?offset=${requestOffset}`, { signal: signal ?? null }),
      ]);
      if (results.some((r) => !r.ok))
        throw new Error("Workspace unavailable. Check your access or sign in again.");
      const [catalogue, assets, contact, inbox] = await Promise.all(results.map((r) => r.json()));
      signal?.throwIfAborted();
      setDepartments(catalogue.departments);
      setProducts(catalogue.products);
      setMore(catalogue.hasMore);
      setPhotoHealth(catalogue.photoHealth ?? null);
      setNextProductPosition(catalogue.nextProductPosition);
      setMedia(assets);
      setContacts(contact);
      setRequests(inbox);
      setLoaded(true);
    },
    [root, offset, requestOffset, filters],
  );
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => refresh(controller.signal))
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      });
    return () => controller.abort();
  }, [refresh]);
  const activeDepartments = departments.filter((d) => !d.archived);
  const desiredDepartment = editValues?.department_id ?? preferredDepartment;
  const selectedDepartment = activeDepartments.some((d) => d.id === desiredDepartment)
    ? desiredDepartment
    : editValues
      ? ""
      : (activeDepartments[0]?.id ?? "");
  useEffect(() => {
    if (!productDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [productDirty]);
  const processing = media.some((m) => m.state === "processing");
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => {
      void fetch(`${root}/media`)
        .then(async (r) => {
          if (r.ok) setMedia(await r.json());
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [root, processing]);
  async function write(path: string, method: string, value: unknown) {
    const response = await fetch(root + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    if (!response.ok) {
      const result = await response.json();
      const conflicts: Record<string, string> = {
        media_in_use:
          "Remove this image from products and saved/published shop branding before deleting it.",
        department_contains_products:
          "Archive or move the department’s products before archiving it.",
        department_name_in_use:
          "A department with this name already exists, including archived departments. Activate it in Departments or choose a different name.",
        catalogue_item_deleted:
          "This item is deleted. Restore it from History & deleted items within 30 days.",
        slug_in_use: "This address is already used in this shop. Choose another address.",
        stale_version: "This record changed in another session. Reload before editing again.",
      };
      throw new Error(
        response.status === 409
          ? (conflicts[result.error] ??
              "This change conflicts with current data. Reload before trying again.")
          : response.status === 403
            ? "Fresh authentication or additional permission is required. Verify MFA or sign in again."
            : result.error === "media_quota_exceeded"
              ? "Image storage is full. Delete unused images or cancel unfinished uploads."
              : "Could not save. Check the fields, access and limits.",
      );
    }
    return response.json();
  }
  async function act(work: () => Promise<unknown>, success: string, confirmed?: () => void) {
    if (!loaded) {
      setMessage("Reload the catalogue before making another change.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await work();
      confirmed?.();
      try {
        await refresh();
        setMessage(success);
      } catch {
        setLoaded(false);
        setMessage(
          `${success} The latest catalogue could not reload. Reload the catalogue before making another change.`,
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The change was not confirmed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function addProduct(departmentId?: string) {
    if (!replaceProductEditor()) return;
    setProduct(null);
    setCopy(null);
    setProductDirty(false);
    setProductFormKey((key) => key + 1);
    if (departmentId) setPreferredDepartment(departmentId);
    select("products");
    requestAnimationFrame(() => document.getElementById("product-name")?.focus());
  }
  function replaceProductEditor() {
    return (
      !productDirty ||
      window.confirm("Replace this product form? Your unsaved product changes will be cleared.")
    );
  }
  function editProduct(value: Product, duplicate = false) {
    if (!replaceProductEditor()) return;
    setProduct(duplicate ? null : value);
    setCopy(
      duplicate
        ? {
            ...value,
            name: `${value.name.slice(0, 153)} (copy)`,
            slug: "",
            availability: "archived",
          }
        : null,
    );
    setProductFormKey((key) => key + 1);
    setProductDirty(duplicate);
    select("products");
    setMessage(
      duplicate
        ? "Copy ready to edit. Nothing has been saved. Review the name and availability before saving."
        : "",
    );
    requestAnimationFrame(() => document.getElementById("product-name")?.focus());
  }
  function createInlineDepartment() {
    const name = quickDepartmentName.trim(),
      slug = quickDepartmentSlug.trim() || catalogueAddress(name);
    if (!name || !slug) {
      setMessage("Enter a department name and a readable link using letters a–z or numbers.");
      return;
    }
    void act(
      async () => {
        const created = await write("/departments", "POST", {
          name,
          slug,
          position: Math.min(1000000, Math.max(-1, ...departments.map((d) => d.position)) + 1),
          archived: false,
          version: 0,
        });
        setPreferredDepartment(created.id);
        if (product) setProduct({ ...product, department_id: created.id });
        if (copy) setCopy({ ...copy, department_id: created.id });
      },
      "Department created and selected. Continue adding your product.",
      () => {
        setQuickDepartment(false);
        setQuickDepartmentName("");
        setQuickDepartmentSlug("");
      },
    );
  }
  function moveItem(
    kind: "department" | "product",
    value: { id: string; version: number },
    direction: "up" | "down",
  ) {
    if (kind === "product" && productDirty) {
      setMessage("Save or cancel your product edits before changing the order.");
      return;
    }
    void act(
      async () => {
        const result = await write("/catalogue/move", "POST", {
          kind,
          id: value.id,
          version: value.version,
          direction,
        });
        if (!result.moved)
          throw Error(
            `This item is already ${direction === "up" ? "first" : "last"} in its display order.`,
          );
      },
      "Display order updated.",
      () => {
        if (kind === "product") {
          setProduct(null);
          setCopy(null);
          setProductFormKey((key) => key + 1);
        }
      },
    );
  }
  function departmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    void act(
      () =>
        write(
          department ? `/departments/${department.id}` : "/departments",
          department ? "PATCH" : "POST",
          {
            name: field(data, "name"),
            slug: field(data, "slug").trim() || catalogueAddress(field(data, "name")),
            position: Number(data.get("position")),
            archived: data.get("archived") === "on",
            version: department?.version ?? 0,
          },
        ),
      "Department saved.",
      () => {
        if (!department) form.reset();
        setDepartment(null);
      },
    );
  }
  function productValue(p: Product) {
    return {
      departmentId: p.department_id,
      kind: p.kind,
      name: p.name,
      slug: p.slug,
      description: p.description,
      currency: p.currency,
      priceMinor: p.price_minor,
      availability: p.availability,
      position: p.position,
      mediaId: p.media_id,
      version: p.version,
    };
  }
  function productSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    const another =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "another";
    void act(
      () =>
        write(product ? `/products/${product.id}` : "/products", product ? "PATCH" : "POST", {
          departmentId: field(data, "department"),
          kind: field(data, "kind"),
          name: field(data, "name"),
          slug: field(data, "slug").trim() || catalogueAddress(field(data, "name")),
          description: field(data, "description"),
          currency: field(data, "currency"),
          priceMinor: priceToMinor(field(data, "price"), field(data, "currency")),
          availability: field(data, "availability"),
          position: Number(data.get("position")),
          mediaId: field(data, "image") || null,
          version: product?.version ?? 0,
        }),
      another
        ? "Product or service saved. Ready for the next item in this department."
        : "Product or service saved.",
      () => {
        if (another) {
          setPreferredDepartment(field(data, "department"));
          setEntryDefaults({ currency: field(data, "currency"), kind: field(data, "kind") });
        }
        setProductDirty(false);
        setProduct(null);
        setCopy(null);
        setProductFormKey((key) => key + 1);
      },
    );
  }
  function contactsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void act(
      () =>
        write("/contacts", "PUT", {
          version: contacts.version,
          phone: field(data, "phone"),
          whatsapp: field(data, "whatsapp"),
          website: field(data, "website"),
          fulfilment: field(data, "fulfilment"),
          paymentInstructions: field(data, "payment"),
          deliveryInstructions: field(data, "delivery"),
          enquiriesEnabled: data.get("enquiries") === "on",
          reason: field(data, "reason"),
        }),
      "Contact settings saved. Owners will receive a change notice.",
    );
  }
  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      file = data.get("file");
    void act(async () => {
      if (!(file instanceof File) || !file.size || file.size > 4194304)
        throw new Error("Choose a JPEG, PNG or WebP image up to 4 MiB.");
      const session = await write("/media", "POST", {
        bytes: file.size,
        contentType: file.type,
        alt: field(data, "alt"),
      });
      const response = await fetch(`${root}/media/${session.id}`, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok)
        throw new Error("Upload was not completed. Cancel it in the image list or try again.");
    }, "Image uploaded. Processing will appear below.");
  }
  return (
    <div className="catalogue-workspace">
      <p role="status" aria-live="polite">
        {message || (!loaded ? "Loading your catalogue…" : "")}
      </p>
      <p>
        <Link href="/security">Verify account security</Link> ·{" "}
        <Link href="/sign-in">Sign in again</Link>
      </p>
      <WorkspaceSectionNav
        items={catalogueSections}
        active={active}
        select={select}
        label="Catalogue sections"
      />
      <div className="merchant-task-guide" hidden={active === "history"}>
        <div>
          <span className="eyebrow">Build your catalogue</span>
          <h2>What would you like to add?</h2>
          <p>
            Departments are groups, like Crops or Seeds. Add products inside a department; customers
            can open each department and product on its own page.
          </p>
        </div>
        <div className="account-links">
          <Link
            href={`/shopkeeper/shops/${shopId}/products/new`}
            className="button"
            onClick={(event) => {
              if (!replaceProductEditor()) event.preventDefault();
            }}
          >
            Add a product
          </Link>
          <button
            type="button"
            className="button button--outline"
            onClick={() => {
              select("departments");
              requestAnimationFrame(() => document.getElementById("department-name")?.focus());
            }}
          >
            Add a department
          </button>
        </div>
      </div>
      <div className="catalogue-toolbar">
        <button
          type="button"
          className="button button--outline button--small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              await refresh();
              setMessage("Catalogue reloaded.");
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "The catalogue could not reload.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Reload catalogue
        </button>
        {active !== "history" ? (
          <button
            type="button"
            className="button button--outline button--small"
            disabled={busy || !loaded}
            onClick={() => select("history")}
          >
            History & deleted items
          </button>
        ) : null}
      </div>
      <section
        hidden={active !== "departments"}
        role="tabpanel"
        aria-label="Departments"
        id="departments"
        aria-labelledby="departments-title"
      >
        {photoHealth?.missingDepartments.length ? (
          <p className="notice">
            Department thumbnails come from product photos.{" "}
            {photoHealth.missingDepartments.map((item) => item.name).join(", ")} still need a
            photographed product.
          </p>
        ) : null}
        <h2 id="departments-title">Departments</h2>
        <p>
          Think of these as rooms in your shop. For example, Crops can contain maize, beans and
          rice. Each department gets a page automatically once your shop is published.
        </p>
        <p className="catalogue-department-summary">
          {activeDepartments.length} active · {departments.length - activeDepartments.length}{" "}
          archived. Only active departments appear in the product selector.
        </p>
        <ul className="workspace-list">
          {departments.map((d) => (
            <li key={d.id}>
              <span>
                {d.name}
                {d.archived ? " (archived)" : ""}
                {!d.archived && photoHealth?.missingDepartments.some((item) => item.id === d.id) ? (
                  <small className="photo-gap-label">
                    No department thumbnail yet. Add a photographed product.
                  </small>
                ) : null}
              </span>
              {d.archived ? (
                <button
                  type="button"
                  className="button button--outline button--small"
                  disabled={busy || !loaded}
                  onClick={() =>
                    void act(
                      () =>
                        write(`/departments/${d.id}`, "PATCH", {
                          name: d.name,
                          slug: d.slug,
                          position: d.position,
                          archived: false,
                          version: d.version,
                        }),
                      "Department activated. You can now add products to it.",
                    )
                  }
                >
                  Activate {d.name}
                </button>
              ) : null}
              {!d.archived ? (
                <Link
                  className="button button--small"
                  href={`/shopkeeper/shops/${shopId}/products/new?department=${d.id}`}
                  onClick={(event) => {
                    if (!replaceProductEditor()) event.preventDefault();
                  }}
                >
                  Add product to {d.name}
                </Link>
              ) : null}
              {!d.archived ? (
                <button
                  type="button"
                  className="button button--outline button--small"
                  disabled={busy || !loaded}
                  onClick={() => addProduct(d.id)}
                >
                  Open full editor for {d.name}
                </button>
              ) : null}
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  select("departments");
                  setDepartment(d);
                }}
              >
                Edit {d.name}
              </button>
              {!d.archived ? (
                <div className="catalogue-order-actions" aria-label={`Arrange ${d.name}`}>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy || !loaded || activeDepartments[0]?.id === d.id}
                    onClick={() => moveItem("department", d, "up")}
                    aria-label={`Move ${d.name} up`}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy || !loaded || activeDepartments.at(-1)?.id === d.id}
                    onClick={() => moveItem("department", d, "down")}
                    aria-label={`Move ${d.name} down`}
                  >
                    Move down
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className="text-button catalogue-delete"
                disabled={busy || !loaded}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete ${d.name} and its products? They disappear from the shop immediately and can be recovered for 30 days from History & deleted items.`,
                    )
                  )
                    void act(
                      () =>
                        write(`/departments/${d.id}`, "DELETE", {
                          version: d.version,
                          confirm: true,
                        }),
                      "Department and its products moved to Deleted items. Recover them within 30 days.",
                      () => {
                        setDepartment(null);
                        if (product?.department_id === d.id) setProduct(null);
                      },
                    );
                }}
              >
                Delete {d.name}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="account-form editor-form-grid"
          key={department ? `${department.id}:${department.version}` : "new-department"}
          onSubmit={departmentSubmit}
        >
          <h3>{department ? "Edit department" : "Create department"}</h3>
          <div className="editor-form-field">
            <label htmlFor="department-name">Department name</label>
            <input
              id="department-name"
              name="name"
              defaultValue={department?.name}
              required
              maxLength={120}
            />
          </div>
          <details className="merchant-department-options">
            <summary>Department link (optional)</summary>
            <p className="editor-hint">
              We create a readable link from the department name. Only change it if you want a
              different address.
            </p>{" "}
            <div className="editor-form-field">
              <label htmlFor="department-slug">Department address</label>
              <input
                id="department-slug"
                name="slug"
                defaultValue={department?.slug}
                placeholder="Made from the department name if left blank"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxLength={80}
              />
            </div>
          </details>
          <input
            name="position"
            type="hidden"
            value={
              department?.position ??
              Math.min(1000000, Math.max(-1, ...departments.map((d) => d.position)) + 1)
            }
          />
          <p className="editor-hint">
            You can leave the address blank. New departments are placed after your existing ones.
          </p>
          {department ? (
            <label className="check-label">
              <input name="archived" type="checkbox" defaultChecked={department.archived} />
              Hide this department from customers (archive or move its products first)
            </label>
          ) : null}
          <div className="account-links">
            <button className="button" disabled={busy || !loaded}>
              {department ? "Save department" : "Create department"}
            </button>
            {department && (
              <button className="text-button" type="button" onClick={() => setDepartment(null)}>
                Cancel department edit
              </button>
            )}
          </div>
        </form>
      </section>
      <section
        hidden={active !== "products"}
        role="tabpanel"
        aria-label="Products"
        id="products"
        aria-labelledby="products-title"
      >
        <h2 id="products-title">Products and services</h2>
        {photoHealth &&
        (photoHealth.missingProductCount > 0 || photoHealth.missingDepartments.length > 0) ? (
          <aside className="notice photo-readiness" aria-label="Photos to finish">
            <strong>Photos still to finish.</strong>
            <p>
              {photoHealth.missingProductCount} current products need a ready photo. Department
              thumbnails come from their product photos.
            </p>
            <ul>
              {photoHealth.missingProducts.map((item) => (
                <li key={item.id}>
                  <Link href={`/shopkeeper/shops/${shopId}/products/${item.id}/edit`}>
                    Add a photo to {item.name}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href={`/shopkeeper/shops/${shopId}/products/new`}>
              Use the simple photo & product setup →
            </Link>
          </aside>
        ) : null}
        {!products.length &&
          !filters.query &&
          !filters.departmentId &&
          filters.availability === "all" && (
            <div className="catalogue-empty">
              <h3>Make room for your first product.</h3>
              <p>
                {activeDepartments.length
                  ? "Choose an active department below, then add your product, photo and price."
                  : departments.length
                    ? "Your departments are archived, so they are not available for new products. Activate one in Departments, then return here."
                    : "Create a department first, then add a product or service with its photo and price."}
              </p>
              {activeDepartments.length > 0 ? (
                <Link className="button" href={`/shopkeeper/shops/${shopId}/products/new`}>
                  Add your first product
                </Link>
              ) : (
                <button
                  className="button button--outline"
                  type="button"
                  onClick={() => {
                    if (departments.length) select("departments");
                    else {
                      setQuickDepartment(true);
                      requestAnimationFrame(() =>
                        document.getElementById("quick-department-name")?.focus(),
                      );
                    }
                  }}
                >
                  {departments.length
                    ? "View archived departments"
                    : "Create your first department"}
                </button>
              )}
            </div>
          )}
        <form
          className="account-form editor-form-grid"
          key={`${product?.id ?? "new"}:${productFormKey}`}
          onSubmit={productSubmit}
          onChange={() => setProductDirty(true)}
        >
          <h3>{product ? "Edit product or service" : "Create product or service"}</h3>
          {productDirty ? <p className="editor-hint">Unsaved product changes</p> : null}
          {copy ? (
            <p className="notice">
              You are editing a new copy. It starts hidden from customers; choose Availability when
              it is ready.
            </p>
          ) : null}
          <div className="editor-form-field">
            <label htmlFor="product-name">Product or service name</label>
            <input
              id="product-name"
              name="name"
              defaultValue={editValues?.name}
              required
              maxLength={160}
            />
          </div>

          <div className="editor-form-field">
            <label htmlFor="product-department">Department</label>
            <select
              id="product-department"
              name="department"
              value={selectedDepartment}
              onChange={(event) => {
                setPreferredDepartment(event.target.value);
                if (product) setProduct({ ...product, department_id: event.target.value });
                if (copy) setCopy({ ...copy, department_id: event.target.value });
              }}
              required
            >
              <option value="" disabled>
                {activeDepartments.length
                  ? "Choose an active department"
                  : departments.length
                    ? "No active departments — activate one first"
                    : "Create a department first"}
              </option>
              {activeDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <p className="editor-hint">
              {activeDepartments.length
                ? `${activeDepartments.length} active departments available. Choose where this product belongs.`
                : "Open Departments and activate an archived department or create a new one."}
            </p>
            <button
              type="button"
              className="text-button"
              disabled={busy || !loaded}
              onClick={() => setQuickDepartment((value) => !value)}
            >
              Create a department here
            </button>
            {quickDepartment ? (
              <div
                className="inline-department"
                role="group"
                aria-label="Create a department without leaving this product"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
                    event.preventDefault();
                    if (!busy && loaded) createInlineDepartment();
                  }
                }}
              >
                <label htmlFor="quick-department-name">New department name</label>
                <input
                  id="quick-department-name"
                  value={quickDepartmentName}
                  onChange={(event) => setQuickDepartmentName(event.target.value)}
                  maxLength={120}
                />
                <details>
                  <summary>Department link (optional)</summary>
                  <label htmlFor="quick-department-link">New department link</label>
                  <input
                    id="quick-department-link"
                    value={quickDepartmentSlug}
                    onChange={(event) => setQuickDepartmentSlug(event.target.value)}
                    maxLength={80}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    placeholder="Made from the name"
                  />
                </details>
                <button
                  type="button"
                  className="button button--small"
                  disabled={busy || !loaded || !quickDepartmentName.trim()}
                  onClick={createInlineDepartment}
                >
                  Create & select department
                </button>
              </div>
            ) : null}
          </div>

          <div className="editor-form-field">
            <label htmlFor="product-description">Description</label>
            <textarea
              id="product-description"
              name="description"
              defaultValue={editValues?.description}
              maxLength={2000}
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="product-currency">Currency</label>
            <select
              id="product-currency"
              name="currency"
              defaultValue={editValues?.currency ?? entryDefaults.currency}
            >
              {["UGX", "USD", "KES", "EUR", "GBP"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="editor-form-field">
            <label htmlFor="product-price">Price (optional)</label>
            <input
              id="product-price"
              name="price"
              defaultValue={editablePrice(
                editValues?.price_minor ?? null,
                editValues?.currency ?? entryDefaults.currency,
              )}
              inputMode="decimal"
              maxLength={23}
              placeholder="For example, 5000"
            />
          </div>
          <p className="editor-hint">
            Enter the amount customers pay: for example 5000 UGX or 19.95 USD. Leave the price blank
            if customers should ask you.
          </p>
          <div className="editor-form-field">
            <label htmlFor="product-availability">Availability</label>
            <select
              id="product-availability"
              name="availability"
              defaultValue={editValues?.availability ?? "available"}
            >
              {["available", "unavailable", "archived"].map((a) => (
                <option key={a} value={a}>
                  {
                    (
                      {
                        available: "Available to customers",
                        unavailable: "Currently unavailable",
                        archived: "Hidden from customers",
                      } as Record<string, string>
                    )[a]
                  }
                </option>
              ))}
            </select>
          </div>
          <input name="position" type="hidden" value={product?.position ?? nextProductPosition} />
          <div className="editor-form-field">
            <label htmlFor="product-image">Product photo</label>
            <select id="product-image" name="image" defaultValue={editValues?.media_id ?? ""}>
              <option value="">No image</option>
              {media
                .filter((m) => m.state === "ready")
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.alt}
                  </option>
                ))}
            </select>
          </div>
          <details className="merchant-product-options">
            <summary>Product link & type (optional)</summary>
            <p className="editor-hint">
              Your link is made from the product name. You can change it, or choose Service if you
              sell a service.
            </p>{" "}
            <div className="editor-form-field">
              <label htmlFor="product-slug">Product address</label>
              <input
                id="product-slug"
                name="slug"
                defaultValue={editValues?.slug}
                placeholder="Made from the product name if left blank"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxLength={80}
              />
            </div>{" "}
            <div className="editor-form-field">
              <label htmlFor="product-kind">Type</label>
              <select
                id="product-kind"
                name="kind"
                defaultValue={editValues?.kind ?? entryDefaults.kind}
              >
                <option value="product">Product</option>
                <option value="service">Service</option>
              </select>
            </div>
          </details>
          <p className="editor-hint">
            Need a photo?{" "}
            <button type="button" className="text-button" onClick={() => select("images")}>
              Upload a product photo
            </button>
            . Return to Products afterwards; your entered details stay here.
          </p>
          <div className="account-links">
            <button className="button" disabled={busy || !loaded || !activeDepartments.length}>
              {product ? "Save product or service" : "Create product or service"}
            </button>
            <button
              type="submit"
              name="afterSave"
              value="another"
              className="button button--outline"
              disabled={busy || !loaded || !activeDepartments.length}
            >
              Save & add another
            </button>
            {product || copy ? (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  if (replaceProductEditor()) {
                    setProduct(null);
                    setCopy(null);
                    setProductDirty(false);
                    setProductFormKey((key) => key + 1);
                  }
                }}
              >
                Cancel product edit
              </button>
            ) : null}
          </div>
        </form>
        <h3 className="merchant-list-heading">Your products & services</h3>
        <form
          key={JSON.stringify(filters)}
          className="catalogue-filters"
          aria-label="Find catalogue products"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setOffset(0);
            const next = {
              query: field(data, "query").trim(),
              departmentId: field(data, "department"),
              availability: field(data, "availability"),
            };
            setFilters(next);
            if (!editValues && !productDirty && next.departmentId)
              setPreferredDepartment(next.departmentId);
          }}
        >
          <div>
            <label htmlFor="catalogue-query">Find a product</label>
            <input
              id="catalogue-query"
              name="query"
              type="search"
              maxLength={80}
              defaultValue={filters.query}
              placeholder="Search product names"
            />
          </div>
          <div>
            <label htmlFor="catalogue-department-filter">In department</label>
            <select
              id="catalogue-department-filter"
              name="department"
              defaultValue={filters.departmentId}
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.archived ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="catalogue-availability-filter">Listing status</label>
            <select
              id="catalogue-availability-filter"
              name="availability"
              defaultValue={filters.availability}
            >
              <option value="all">All statuses</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
              <option value="archived">Hidden</option>
            </select>
          </div>
          <button className="button button--small" disabled={busy}>
            Find products
          </button>
          {filters.query || filters.departmentId || filters.availability !== "all" ? (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setFilters({ query: "", departmentId: "", availability: "all" });
                setOffset(0);
              }}
            >
              Clear product filters
            </button>
          ) : null}
        </form>
        <p className="editor-hint">
          {products.length} on this page. Choose one active department and clear name/status filters
          to arrange its visible products.
        </p>
        {!products.length && loaded ? <p>No products match these filters.</p> : null}
        <ul className="workspace-list">
          {products.map((p, index) => (
            <li key={p.id}>
              <div className="catalogue-product-identity">
                {p.media_id ? (
                  <Image
                    src={`${root}/media/${p.media_id}/thumbnail`}
                    alt=""
                    width={64}
                    height={64}
                    unoptimized
                    className="catalogue-product-photo"
                  />
                ) : (
                  <span
                    className="catalogue-product-photo catalogue-product-letter"
                    aria-hidden="true"
                  >
                    {p.name.slice(0, 1)}
                  </span>
                )}
                <div>
                  <strong>{p.name}</strong>
                  {!p.media_id ? (
                    <small className="photo-gap-label">
                      {p.kind === "service"
                        ? "A photo can help explain this service."
                        : p.availability === "archived"
                          ? "Hidden listing — no photo yet."
                          : "Photo missing."}{" "}
                      <Link href={`/shopkeeper/shops/${shopId}/products/${p.id}/edit`}>
                        Add photo
                      </Link>
                    </small>
                  ) : null}
                  <span>
                    {formatMinorMoney(p.price_minor, p.currency)} ·{" "}
                    {p.availability.replaceAll("_", " ")}
                  </span>
                </div>
              </div>
              <div className="account-links">
                <button className="text-button" disabled={busy} onClick={() => editProduct(p)}>
                  Edit {p.name}
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy || !loaded}
                  onClick={() => editProduct(p, true)}
                  aria-label={`Duplicate ${p.name}`}
                >
                  Duplicate
                </button>
                {filters.departmentId &&
                !filters.query &&
                filters.availability === "all" &&
                !departments.find((d) => d.id === filters.departmentId)?.archived &&
                p.availability !== "archived" ? (
                  <div className="catalogue-order-actions">
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || !loaded || (offset === 0 && index === 0)}
                      onClick={() => moveItem("product", p, "up")}
                      aria-label={`Move ${p.name} up`}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || !loaded || (!more && index === products.length - 1)}
                      onClick={() => moveItem("product", p, "down")}
                      aria-label={`Move ${p.name} down`}
                    >
                      Move down
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="text-button catalogue-delete"
                  disabled={busy || !loaded}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete ${p.name}? It disappears from the shop immediately and can be recovered for 30 days.`,
                      )
                    )
                      void act(
                        () =>
                          write(`/products/${p.id}`, "DELETE", {
                            version: p.version,
                            confirm: true,
                          }),
                        "Product moved to Deleted items. Recover it within 30 days.",
                        () => {
                          if (product?.id === p.id) setProduct(null);
                        },
                      );
                  }}
                >
                  Delete {p.name}
                </button>
                {p.availability !== "archived" && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Archive ${p.name}? It will remain in your records.`))
                        void act(
                          () =>
                            write(`/products/${p.id}`, "PATCH", {
                              ...productValue(p),
                              availability: "archived",
                            }),
                          "Product archived.",
                        );
                    }}
                  >
                    Archive {p.name}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="account-links">
          <button
            className="text-button"
            disabled={!offset || busy}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            Previous products
          </button>
          <button
            className="text-button"
            disabled={!more || busy}
            onClick={() => setOffset(offset + 20)}
          >
            Next products
          </button>
        </div>
      </section>
      <section
        id="history"
        role="tabpanel"
        aria-label="History & deleted items"
        hidden={active !== "history"}
      >
        {active === "history" ? (
          <CatalogueHistory
            shopId={shopId}
            onChanged={async () => {
              await refresh();
              setMessage("Catalogue reloaded after recovery.");
            }}
          />
        ) : null}
      </section>
      <section
        hidden={active !== "images"}
        role="tabpanel"
        aria-label="Images"
        id="images"
        aria-labelledby="images-title"
      >
        <h2 id="images-title">Shop images</h2>
        <p>
          Uploading adds an image to your library. Assign it to a product, or choose it as your
          cover or logo in{" "}
          {canDesign ? (
            <Link href={`/shopkeeper/shops/${shopId}/design`}>Design &amp; publish</Link>
          ) : (
            "Design & publish (design access required)"
          )}
          . Publish the saved design to show your cover on the mall’s shop list.
        </p>
        <p>
          Non-animated JPEG, PNG or WebP, up to 4 MiB, 16 million pixels and 8192 pixels per side.
          Describe the image for customers using assistive technology. Processing must finish before
          an image can be assigned.
        </p>
        <form className="account-form editor-form-grid" onSubmit={upload}>
          <div className="editor-form-field">
            <label htmlFor="media-file">Image file</label>
            <input
              id="media-file"
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="media-alt">Image description</label>
            <input id="media-alt" name="alt" required maxLength={240} />
          </div>
          <button className="button" disabled={busy || !loaded}>
            Upload image
          </button>
        </form>
        <ul className="workspace-list">
          {media.map((m) => (
            <li key={m.id}>
              {m.state === "ready" && (
                <Image
                  src={`${root}/media/${m.id}/thumbnail`}
                  width={160}
                  height={120}
                  alt={m.alt}
                  unoptimized
                  loading="lazy"
                  className="catalogue-thumbnail"
                />
              )}
              <span>
                {m.alt} · {m.state}
              </span>
              {m.state === "rejected" && (
                <p>
                  This image could not be processed. Choose a supported, undamaged image within the
                  size limits above.
                </p>
              )}
              {m.state === "failed" && (
                <p>Processing failed. Retry it or delete this upload and choose another image.</p>
              )}
              <div className="account-links">
                {m.state === "failed" && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => write(`/media/${m.id}`, "POST", { version: m.version }),
                        "Image processing retried.",
                      )
                    }
                  >
                    Retry {m.alt}
                  </button>
                )}
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete ${m.alt}? Remove product and shop branding references first.`,
                      )
                    )
                      void act(
                        () => write(`/media/${m.id}`, "DELETE", { version: m.version }),
                        "Image deleted.",
                      );
                  }}
                >
                  Delete {m.alt}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section
        hidden={active !== "contacts"}
        role="tabpanel"
        aria-label="Contact settings"
        id="contacts"
        aria-labelledby="contacts-title"
      >
        <h2 id="contacts-title">Contact and commerce settings</h2>
        <p>
          Sensitive changes require recent authentication. Payment instructions describe your terms;
          they do not collect a payment.
        </p>
        <form
          className="account-form editor-form-grid"
          key={contacts.version}
          onSubmit={contactsSubmit}
        >
          <div className="editor-form-field">
            <label htmlFor="contact-phone">Call number</label>
            <input
              id="contact-phone"
              name="phone"
              type="tel"
              defaultValue={contacts.phone}
              placeholder="+256…"
              pattern="\+[1-9][0-9]{7,14}"
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="contact-whatsapp">WhatsApp number</label>
            <input
              id="contact-whatsapp"
              name="whatsapp"
              type="tel"
              defaultValue={contacts.whatsapp}
              placeholder="+256…"
              pattern="\+[1-9][0-9]{7,14}"
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="contact-website">Website</label>
            <input
              id="contact-website"
              name="website"
              type="url"
              defaultValue={contacts.website}
              placeholder="https://example.com"
              maxLength={500}
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="contact-fulfilment">Delivery and pickup</label>
            <select id="contact-fulfilment" name="fulfilment" defaultValue={contacts.fulfilment}>
              {["contact", "pickup", "delivery", "pickup_and_delivery"].map((f) => (
                <option value={f} key={f}>
                  {f.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="editor-form-field">
            <label htmlFor="contact-delivery">Delivery or pickup instructions</label>
            <textarea
              id="contact-delivery"
              name="delivery"
              defaultValue={contacts.delivery_instructions}
              maxLength={500}
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="contact-payment">Merchant payment instructions</label>
            <textarea
              id="contact-payment"
              name="payment"
              defaultValue={contacts.payment_instructions}
              maxLength={500}
            />
          </div>
          <label className="check-label">
            <input type="checkbox" name="enquiries" defaultChecked={contacts.enquiries_enabled} />{" "}
            Enable customer requests when this shop is eligible to receive them
          </label>
          <div className="editor-form-field">
            <label htmlFor="contact-reason">Reason for this change</label>
            <input id="contact-reason" name="reason" required minLength={3} maxLength={240} />
          </div>
          <button className="button" disabled={busy || !loaded}>
            Save contact settings
          </button>
        </form>
        {contacts.enquiries_enabled && (
          <p>
            <Link href={`/contact/${shopId}`}>Open customer contact page</Link>
          </p>
        )}
      </section>
      <section
        hidden={active !== "requests"}
        role="tabpanel"
        aria-label="Customer requests"
        id="requests"
        aria-labelledby="requests-title"
      >
        <h2 id="requests-title">Customer requests</h2>
        <p>
          A request is not a confirmed order, payment or stock reservation. Contact the customer to
          agree the next step.
        </p>
        {!requests.length && <p>No customer requests on this page.</p>}
        <ul className="workspace-list">
          {requests.map((r) => (
            <li key={r.id}>
              <div>
                <h3>
                  {r.kind} from {r.name}
                </h3>
                {r.erased_at ? (
                  <p>Personal content erased; minimal closed receipt retained.</p>
                ) : null}
                <p>{r.reply_to}</p>
                {r.product_name ? (
                  <p>
                    <strong>About: {r.product_name}</strong>{" "}
                    <span>View the current listing in Products & services.</span>
                  </p>
                ) : null}
                <p className="request-message">{r.message}</p>
                <p>{r.status}</p>
              </div>
              {r.status !== "closed" && (
                <div className="account-links">
                  {r.status === "new" && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () =>
                            write(`/requests/${r.id}`, "PATCH", {
                              status: "acknowledged",
                              version: r.version,
                            }),
                          "Request acknowledged.",
                        )
                      }
                    >
                      Acknowledge request from {r.name}
                    </button>
                  )}
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () =>
                          write(`/requests/${r.id}`, "PATCH", {
                            status: "closed",
                            version: r.version,
                          }),
                        "Request closed.",
                      )
                    }
                  >
                    Close request from {r.name}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="account-links">
          <button
            className="text-button"
            disabled={!requestOffset || busy}
            onClick={() => setRequestOffset(Math.max(0, requestOffset - 20))}
          >
            Previous requests
          </button>
          <button
            className="text-button"
            disabled={requests.length < 20 || busy}
            onClick={() => setRequestOffset(requestOffset + 20)}
          >
            Next requests
          </button>
        </div>
      </section>
    </div>
  );
}
