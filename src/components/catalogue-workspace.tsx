"use client";
import Image from "next/image";
import Link from "next/link";
import { formatMinorMoney } from "@/modules/money";
import { useCallback, useEffect, useState, type FormEvent } from "react";

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
};
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
export function CatalogueWorkspace({ shopId }: { shopId: string }) {
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
    [product, setProduct] = useState<Product | null>(null);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const results = await Promise.all([
        fetch(`${root}/catalogue?offset=${offset}`, { signal: signal ?? null }),
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
      setMedia(assets);
      setContacts(contact);
      setRequests(inbox);
      setLoaded(true);
    },
    [root, offset, requestOffset],
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
        media_in_use: "Remove this image from its products before deleting it.",
        department_contains_products:
          "Archive or move the department’s products before archiving it.",
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
  async function act(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      await refresh();
      setDepartment(null);
      setProduct(null);
      setMessage(success);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The change was not confirmed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function departmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void act(
      () =>
        write(
          department ? `/departments/${department.id}` : "/departments",
          department ? "PATCH" : "POST",
          {
            name: field(data, "name"),
            slug: field(data, "slug"),
            position: Number(data.get("position")),
            archived: data.get("archived") === "on",
            version: department?.version ?? 0,
          },
        ),
      "Department saved.",
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
    const data = new FormData(event.currentTarget);
    void act(
      () =>
        write(product ? `/products/${product.id}` : "/products", product ? "PATCH" : "POST", {
          departmentId: field(data, "department"),
          kind: field(data, "kind"),
          name: field(data, "name"),
          slug: field(data, "slug"),
          description: field(data, "description"),
          currency: field(data, "currency"),
          priceMinor: field(data, "price") || null,
          availability: field(data, "availability"),
          position: Number(data.get("position")),
          mediaId: field(data, "image") || null,
          version: product?.version ?? 0,
        }),
      "Product or service saved.",
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
      <nav className="merchant-tools" aria-label="Catalogue sections">
        <a className="button button--outline button--small" href="#departments">
          Departments
        </a>
        <a className="button button--outline button--small" href="#products">
          Products
        </a>
        <a className="button button--outline button--small" href="#images">
          Images
        </a>
        <a className="button button--outline button--small" href="#contacts">
          Contacts
        </a>
        <a className="button button--outline button--small" href="#requests">
          Customer requests
        </a>
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
      </nav>
      <section id="departments" aria-labelledby="departments-title">
        <h2 id="departments-title">Departments</h2>
        <ul className="workspace-list">
          {departments.map((d) => (
            <li key={d.id}>
              <span>
                {d.name}
                {d.archived ? " (archived)" : ""} · position {d.position}
              </span>
              <button className="text-button" disabled={busy} onClick={() => setDepartment(d)}>
                Edit {d.name}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="account-form"
          key={department ? `${department.id}:${department.version}` : "new-department"}
          onSubmit={departmentSubmit}
        >
          <h3>{department ? "Edit department" : "Create department"}</h3>
          <label htmlFor="department-name">Department name</label>
          <input
            id="department-name"
            name="name"
            defaultValue={department?.name}
            required
            maxLength={120}
          />
          <label htmlFor="department-slug">Department address</label>
          <input
            id="department-slug"
            name="slug"
            defaultValue={department?.slug}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={80}
          />
          <label htmlFor="department-position">Department position</label>
          <input
            id="department-position"
            name="position"
            type="number"
            min={0}
            max={1000000}
            defaultValue={department?.position ?? 0}
            required
          />
          <label className="check-label">
            <input name="archived" type="checkbox" defaultChecked={department?.archived} /> Archive
            department (archive or move its products first)
          </label>
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
      <section id="products" aria-labelledby="products-title">
        <h2 id="products-title">Products and services</h2>
        {!products.length && <p>No products on this page. Create one below.</p>}
        <ul className="workspace-list">
          {products.map((p) => (
            <li key={p.id}>
              <span>
                {p.name} · {formatMinorMoney(p.price_minor, p.currency)} · {p.availability}
              </span>
              <div className="account-links">
                <button className="text-button" disabled={busy} onClick={() => setProduct(p)}>
                  Edit {p.name}
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
        <form
          className="account-form"
          key={product ? `${product.id}:${product.version}` : "new-product"}
          onSubmit={productSubmit}
        >
          <h3>{product ? "Edit product or service" : "Create product or service"}</h3>
          <label htmlFor="product-name">Product or service name</label>
          <input
            id="product-name"
            name="name"
            defaultValue={product?.name}
            required
            maxLength={160}
          />
          <label htmlFor="product-slug">Product address</label>
          <input
            id="product-slug"
            name="slug"
            defaultValue={product?.slug}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={80}
          />
          <label htmlFor="product-department">Department</label>
          <select
            id="product-department"
            name="department"
            defaultValue={product?.department_id}
            required
          >
            {departments
              .filter((d) => !d.archived)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
          <label htmlFor="product-kind">Type</label>
          <select id="product-kind" name="kind" defaultValue={product?.kind ?? "product"}>
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
          <label htmlFor="product-description">Description</label>
          <textarea
            id="product-description"
            name="description"
            defaultValue={product?.description}
            maxLength={2000}
          />
          <label htmlFor="product-currency">Currency</label>
          <select id="product-currency" name="currency" defaultValue={product?.currency ?? "UGX"}>
            {["UGX", "USD", "KES", "EUR", "GBP"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label htmlFor="product-price">
            Price in minor units (leave blank for ask-for-price)
          </label>
          <input
            id="product-price"
            name="price"
            defaultValue={product?.price_minor ?? ""}
            inputMode="numeric"
            pattern="(0|[1-9][0-9]{0,19})"
            maxLength={20}
          />
          <p>UGX uses whole shillings; USD, KES, EUR and GBP use hundredths.</p>
          <label htmlFor="product-availability">Availability</label>
          <select
            id="product-availability"
            name="availability"
            defaultValue={product?.availability ?? "available"}
          >
            {["available", "unavailable", "archived"].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <label htmlFor="product-position">Product position</label>
          <input
            id="product-position"
            name="position"
            type="number"
            min={0}
            max={1000000}
            defaultValue={product?.position ?? 0}
            required
          />
          <label htmlFor="product-image">Ready image</label>
          <select id="product-image" name="image" defaultValue={product?.media_id ?? ""}>
            <option value="">No image</option>
            {media
              .filter((m) => m.state === "ready")
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.alt}
                </option>
              ))}
          </select>
          <div className="account-links">
            <button
              className="button"
              disabled={busy || !loaded || !departments.some((d) => !d.archived)}
            >
              {product ? "Save product or service" : "Create product or service"}
            </button>
            {product && (
              <button className="text-button" type="button" onClick={() => setProduct(null)}>
                Cancel product edit
              </button>
            )}
          </div>
        </form>
      </section>
      <section id="images" aria-labelledby="images-title">
        <h2 id="images-title">Shop images</h2>
        <p>
          Non-animated JPEG, PNG or WebP, up to 4 MiB, 16 million pixels and 8192 pixels per side.
          Describe the image for customers using assistive technology. Processing must finish before
          an image can be assigned.
        </p>
        <form className="account-form" onSubmit={upload}>
          <label htmlFor="media-file">Image file</label>
          <input
            id="media-file"
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
          />
          <label htmlFor="media-alt">Image description</label>
          <input id="media-alt" name="alt" required maxLength={240} />
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
                    if (window.confirm(`Delete ${m.alt}? Remove product references first.`))
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
      <section id="contacts" aria-labelledby="contacts-title">
        <h2 id="contacts-title">Contact and commerce settings</h2>
        <p>
          Sensitive changes require recent authentication. Payment instructions describe your terms;
          they do not collect a payment.
        </p>
        <form className="account-form" key={contacts.version} onSubmit={contactsSubmit}>
          <label htmlFor="contact-phone">Call number</label>
          <input
            id="contact-phone"
            name="phone"
            type="tel"
            defaultValue={contacts.phone}
            placeholder="+256…"
            pattern="\+[1-9][0-9]{7,14}"
          />
          <label htmlFor="contact-whatsapp">WhatsApp number</label>
          <input
            id="contact-whatsapp"
            name="whatsapp"
            type="tel"
            defaultValue={contacts.whatsapp}
            placeholder="+256…"
            pattern="\+[1-9][0-9]{7,14}"
          />
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            name="website"
            type="url"
            defaultValue={contacts.website}
            placeholder="https://example.com"
            maxLength={500}
          />
          <label htmlFor="contact-fulfilment">Delivery and pickup</label>
          <select id="contact-fulfilment" name="fulfilment" defaultValue={contacts.fulfilment}>
            {["contact", "pickup", "delivery", "pickup_and_delivery"].map((f) => (
              <option value={f} key={f}>
                {f.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <label htmlFor="contact-delivery">Delivery or pickup instructions</label>
          <textarea
            id="contact-delivery"
            name="delivery"
            defaultValue={contacts.delivery_instructions}
            maxLength={500}
          />
          <label htmlFor="contact-payment">Merchant payment instructions</label>
          <textarea
            id="contact-payment"
            name="payment"
            defaultValue={contacts.payment_instructions}
            maxLength={500}
          />
          <label className="check-label">
            <input type="checkbox" name="enquiries" defaultChecked={contacts.enquiries_enabled} />{" "}
            Enable customer requests when this shop is eligible to receive them
          </label>
          <label htmlFor="contact-reason">Reason for this change</label>
          <input id="contact-reason" name="reason" required minLength={3} maxLength={240} />
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
      <section id="requests" aria-labelledby="requests-title">
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
