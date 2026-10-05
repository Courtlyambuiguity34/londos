"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { readApplication } from "@/server/applications";
import type { readInvoice, RentPolicy } from "@/server/rent";
import { formatMinorMoney, formatSignedMinorMoney } from "@/modules/money";

type ApplicationData = Awaited<ReturnType<typeof readApplication>>;
type InvoiceData = Awaited<ReturnType<typeof readInvoice>>;
function messageFor(code: string) {
  const messages: Record<string, string> = {
    stale_version: "This record changed. Reload it before trying again.",
    fresh_authentication_required:
      "Please verify your account again in Account security, or sign out and sign in, then retry.",
    mfa_required: "Verify MFA in Account security before continuing.",
    verification_evidence_required:
      "Add at least one private verification image before submitting.",
    invalid_evidence_image: "Use a valid, non-animated JPEG, PNG or WebP image up to 2 MiB.",
    receipt_already_used:
      "That receipt reference was already recorded. Review the ledger before retrying.",
    invoice_reference_mismatch:
      "The payment's invoice reference does not match this invoice. Nothing was recorded.",
    amount_exceeds_balance:
      "The amount is larger than the remaining balance. Nothing was recorded.",
    idempotency_conflict:
      "This request key already identifies a different change. Reload and review the record.",
    conflict_of_interest: "An operator cannot review or reconcile a merchant they belong to.",
    application_not_editable:
      "This application is with the reviewer. Wait for a request for information before editing.",
    renewal_not_due_yet:
      "This shop already has more than one period of coverage. Request renewal later.",
  };
  return (
    messages[code] ??
    "The change was not confirmed. Check your access and the fields, then reload the record."
  );
}
async function send(url: string, method: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(messageFor(data.error));
  return data;
}
function fields(form: HTMLFormElement) {
  const f = new FormData(form);
  return {
    businessName: String(f.get("businessName")),
    category: String(f.get("category")),
    location: String(f.get("location")),
    description: String(f.get("description")),
    phone: String(f.get("phone")),
  };
}
function BusinessFields({ application }: { application?: ApplicationData["application"] }) {
  return (
    <>
      <label htmlFor="business-name">Business name</label>
      <input
        id="business-name"
        name="businessName"
        defaultValue={application?.business_name}
        required
        minLength={2}
        maxLength={120}
      />
      <label htmlFor="business-category">Business category</label>
      <select
        id="business-category"
        name="category"
        defaultValue={application?.category ?? "fashion"}
      >
        {["fashion", "electronics", "beauty", "food", "home", "services", "other"].map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <label htmlFor="business-location">Business location</label>
      <input
        id="business-location"
        name="location"
        defaultValue={application?.location}
        required
        minLength={2}
        maxLength={160}
      />
      <label htmlFor="business-description">What does your business offer?</label>
      <textarea
        id="business-description"
        name="description"
        defaultValue={application?.description}
        required
        minLength={20}
        maxLength={2000}
      />
      <label htmlFor="business-phone">Business telephone, including country code</label>
      <input
        id="business-phone"
        name="phone"
        type="tel"
        placeholder="+256700000001"
        defaultValue={application?.phone}
        required
        pattern="\+[1-9][0-9]{7,14}"
        maxLength={16}
      />
    </>
  );
}
export function CreateApplicationForm({
  merchants,
}: {
  merchants: { id: string; name: string }[];
}) {
  const router = useRouter(),
    key = useRef<string | null>(null);
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setPending(true);
    setMessage("");
    try {
      key.current ??= crypto.randomUUID();
      const data = await send("/api/workspace/applications", "POST", {
        ...fields(form),
        key: key.current,
        ...(f.get("merchantId") ? { merchantId: String(f.get("merchantId")) } : {}),
      });
      router.push(`/shopkeeper/applications/${data.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The service is unavailable.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="account-form" onSubmit={submit}>
      <BusinessFields />
      <label htmlFor="merchant-account">Merchant account</label>
      <select id="merchant-account" name="merchantId">
        <option value="">Create my own merchant account</option>
        {merchants.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <button className="button" disabled={pending}>
        {pending ? "Saving…" : "Create application draft"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function ApplicationPanel({
  initial,
  operator = false,
  policies = [],
}: {
  initial: ApplicationData;
  operator?: boolean;
  policies?: RentPolicy[];
}) {
  const [data, setData] = useState(initial),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  const a = data.application,
    base = `/api/${operator ? "operator" : "workspace"}/applications/${a.id}`,
    editable = ["draft", "needs_information"].includes(a.state);
  async function reload() {
    const r = await fetch(base, { cache: "no-store" });
    if (!r.ok) throw new Error("The application could not be reloaded. Check your access.");
    setData(await r.json());
    router.refresh();
  }
  async function work(task: () => Promise<unknown>, success: string) {
    setPending(true);
    setMessage("");
    try {
      await task();
      await reload();
      setMessage(success);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The service is unavailable.");
    } finally {
      setPending(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = fields(e.currentTarget);
    await work(
      () => send(base, "PATCH", { ...body, version: a.version }),
      "Application details saved.",
    );
  }
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form),
      file = f.get("evidence") as File;
    if (!file?.size || file.size > 2097152) {
      setMessage("Choose a JPEG, PNG or WebP image up to 2 MiB.");
      return;
    }
    await work(async () => {
      const r = await fetch(`${base}/evidence/${f.get("slot")}`, {
        method: "PUT",
        headers: { "Content-Type": file.type, "X-Record-Version": String(a.version) },
        body: file,
      });
      const result = await r.json();
      if (!r.ok) throw new Error(messageFor(result.error));
      form.reset();
    }, "Private verification image saved.");
  }
  async function review(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      decision = String(f.get("decision"));
    await work(
      () =>
        send(`${base}/decision`, "POST", {
          version: a.version,
          decision,
          reason: String(f.get("reason")),
          confirm: f.get("confirm") === "on",
          ...(decision === "approved" ? { policyId: String(f.get("policyId")) } : {}),
        }),
      "Review decision saved.",
    );
  }
  return (
    <div className="lifecycle-panel">
      <p>
        <strong>Application status: {a.state.replaceAll("_", " ")}</strong>
      </p>
      {a.review_reason ? <p>Reviewer message: {a.review_reason}</p> : null}
      {!operator && editable ? (
        <form className="account-form" onSubmit={save} key={a.version}>
          <BusinessFields application={a} />
          <button className="button" disabled={pending}>
            Save application details
          </button>
        </form>
      ) : (
        <dl className="lifecycle-summary">
          <dt>Business</dt>
          <dd>{a.business_name}</dd>
          <dt>Category</dt>
          <dd>{a.category}</dd>
          <dt>Location</dt>
          <dd>{a.location}</dd>
          <dt>Description</dt>
          <dd>{a.description}</dd>
          <dt>Telephone</dt>
          <dd>{a.phone}</dd>
        </dl>
      )}
      <h2>Private verification images</h2>
      <p>
        Only your owners and assigned reviewers can open these images. Opening one requires recent
        authentication. Use fictional evidence in this development environment.
      </p>
      {data.evidence.length ? (
        <ul>
          {data.evidence.map((e) => (
            <li key={e.slot}>
              <a href={`${base}/evidence/${e.slot}`} target="_blank" rel="noreferrer">
                Open private image {e.slot}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p>No evidence uploaded.</p>
      )}
      {!operator && editable ? (
        <>
          <form className="account-form" onSubmit={upload}>
            <label htmlFor="evidence-slot">Image slot</label>
            <select id="evidence-slot" name="slot">
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
            <label htmlFor="evidence-image">
              Verification image (JPEG, PNG or WebP, up to 2 MiB)
            </label>
            <input
              id="evidence-image"
              name="evidence"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
            />
            <button className="button button--outline" disabled={pending}>
              Save private image
            </button>
          </form>
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              void work(
                () => send(`${base}/submit`, "POST", { version: a.version, confirm: true }),
                "Application submitted for review.",
              );
            }}
          >
            <label className="checkbox-label">
              <input type="checkbox" required /> I reviewed the details and confirm submission
            </label>
            <button className="button" disabled={pending}>
              Submit application
            </button>
          </form>
        </>
      ) : null}
      {operator && a.state === "reviewing" ? (
        <form className="account-form" onSubmit={review}>
          <h2>Review decision</h2>
          <label htmlFor="review-decision">Decision</label>
          <select id="review-decision" name="decision">
            <option value="needs_information">Request more information</option>
            <option value="approved">Approve and issue first invoice</option>
            <option value="rejected">Reject application</option>
          </select>
          <label htmlFor="rent-policy">Development rent policy</label>
          <select id="rent-policy" name="policyId">
            {policies.map((p) => (
              <option value={p.id} key={p.id}>
                {p.label} · {formatMinorMoney(p.amount_minor, p.currency)}
              </option>
            ))}
          </select>
          <label htmlFor="review-reason">Reason for the decision</label>
          <textarea id="review-reason" name="reason" required minLength={5} maxLength={500} />
          <label className="checkbox-label">
            <input name="confirm" type="checkbox" required /> I reviewed the evidence and confirm
            this decision
          </label>
          <button className="button" disabled={pending}>
            Save review decision
          </button>
        </form>
      ) : null}
      {a.provisioned_shop_id && !operator ? (
        <Link className="button" href={`/shopkeeper/shops/${a.provisioned_shop_id}`}>
          Set up your provisioned shop
        </Link>
      ) : null}
      <div className="button-row">
        <button
          className="button button--outline"
          disabled={pending}
          onClick={() => void work(async () => {}, "Application reloaded.")}
        >
          Reload application
        </button>
        <Link href="/security">Account security</Link>
      </div>
      <p role="status">{pending ? "Saving…" : message}</p>
      <details>
        <summary>Recent application history</summary>
        <ul>
          {data.history.map((h, i) => (
            <li key={i}>
              {h.action.replaceAll("application.", "").replaceAll(".", " ")} ·{" "}
              {new Date(h.created_at).toISOString()}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
export function ClaimApplicationButton({
  id,
  permission,
}: {
  id: string;
  permission: "review" | "finance";
}) {
  const router = useRouter(),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div>
      <button
        className="button button--small"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            await send(`/api/operator/applications/${id}/claim`, "POST", { permission });
            router.push(`/landlord/${permission === "review" ? "applications" : "rent"}/${id}`);
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Service unavailable.");
          } finally {
            setPending(false);
          }
        }}
      >
        Claim and open
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
export function RenewalButton({ shopId, version }: { shopId: string; version: number }) {
  const router = useRouter(),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div>
      <button
        className="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            const r = await send(`/api/workspace/shops/${shopId}/rent`, "POST", { version });
            router.push(`/shopkeeper/invoices/${r.id}`);
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Service unavailable.");
          } finally {
            setPending(false);
          }
        }}
      >
        Request or open renewal invoice
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
export function InvoicePanel({
  initial,
  operator = false,
}: {
  initial: InvoiceData;
  operator?: boolean;
}) {
  const [data, setData] = useState(initial),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    key = useRef<string | null>(null);
  const i = data.invoice,
    base = `/api/${operator ? "operator" : "workspace"}/invoices/${i.id}`,
    remaining = (BigInt(i.amount_minor) - BigInt(i.credited_minor)).toString();
  async function reload() {
    const r = await fetch(base, { cache: "no-store" });
    if (!r.ok) throw new Error("The invoice could not be reloaded.");
    setData(await r.json());
  }
  async function submit(e: FormEvent<HTMLFormElement>, reverse = false) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setPending(true);
    setMessage("");
    try {
      key.current ??= crypto.randomUUID();
      const body = {
        key: key.current,
        version: i.version,
        reason: String(f.get("reason")),
        confirm: f.get("confirm") === "on",
        ...(reverse
          ? { eventId: String(f.get("eventId")) }
          : {
              kind: String(f.get("kind")),
              amountMinor: String(f.get("amountMinor")),
              currency: "UGX",
              invoiceReference: String(f.get("invoiceReference")),
              reference: String(f.get("reference")),
            }),
      };
      await send(`${base}/${reverse ? "reverse" : "reconcile"}`, "POST", body);
      key.current = null;
      form.reset();
      await reload();
      setMessage(
        reverse
          ? "Correction recorded. Original history is retained."
          : "Development credit recorded.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "The service is unavailable. Check the ledger before retrying.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="lifecycle-panel">
      <p className="development-disclosure">
        Development invoice · Live payment collection is disabled. No payment form or merchant claim
        can activate a shop.
      </p>
      <dl className="lifecycle-summary">
        <dt>Reference</dt>
        <dd className="break-anywhere">{i.reference}</dd>
        <dt>Amount</dt>
        <dd>{formatMinorMoney(i.amount_minor, i.currency)}</dd>
        <dt>Recorded credit</dt>
        <dd>{formatMinorMoney(i.credited_minor, i.currency)}</dd>
        <dt>Remaining</dt>
        <dd>{formatMinorMoney(remaining, i.currency)}</dd>
        <dt>Policy</dt>
        <dd>
          {data.policy.period_days} days per period, {data.policy.grace_days} days of grace
        </dd>
        <dt>Coverage</dt>
        <dd>
          {i.finalized
            ? `${new Date(i.period_start).toISOString()} to ${new Date(i.period_end).toISOString()}`
            : "Provisional: starts when the full amount is verified, or after existing coverage ends."}
        </dd>
      </dl>
      {operator && remaining !== "0" ? (
        <form className="account-form" onSubmit={(e) => void submit(e)}>
          <h2>Record a development credit</h2>
          <label htmlFor="credit-kind">Credit type</label>
          <select id="credit-kind" name="kind">
            <option value="payment">Verified manual payment</option>
            <option value="waiver">Approved development waiver</option>
          </select>
          <label htmlFor="credit-amount">Amount in UGX (whole shillings)</label>
          <input
            id="credit-amount"
            name="amountMinor"
            inputMode="numeric"
            pattern="[1-9][0-9]*"
            maxLength={20}
            required
            defaultValue={remaining}
          />
          <label htmlFor="credit-invoice-reference">
            Invoice reference from the payment record
          </label>
          <input
            id="credit-invoice-reference"
            name="invoiceReference"
            required
            pattern="LON-[A-F0-9]{32}"
            maxLength={36}
          />
          <label htmlFor="credit-reference">Unique receipt or waiver reference</label>
          <input id="credit-reference" name="reference" required minLength={6} maxLength={80} />
          <label htmlFor="credit-reason">Verification reason</label>
          <textarea id="credit-reason" name="reason" required minLength={5} maxLength={500} />
          <label className="checkbox-label">
            <input type="checkbox" name="confirm" required /> I independently verified this
            development credit and confirm recording it
          </label>
          <button className="button" disabled={pending}>
            Record verified credit
          </button>
        </form>
      ) : null}
      {operator &&
      data.events.some((e) => ["payment", "waiver"].includes(e.kind) && !e.reversed) ? (
        <form className="account-form" onSubmit={(e) => void submit(e, true)}>
          <h2>Correct a recorded credit</h2>
          <p>A reversal retains the original event and may close tenancy for arrears.</p>
          <label htmlFor="reverse-event">Credit to reverse</label>
          <select id="reverse-event" name="eventId">
            {data.events
              .filter((e) => ["payment", "waiver"].includes(e.kind) && !e.reversed)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.source_reference} · {formatMinorMoney(e.amount_minor, i.currency)}
                </option>
              ))}
          </select>
          <label htmlFor="reverse-reason">Reason for reversal</label>
          <textarea id="reverse-reason" name="reason" required minLength={5} maxLength={500} />
          <label className="checkbox-label">
            <input type="checkbox" name="confirm" required /> I confirm this correction and its
            effect on tenancy
          </label>
          <button className="button button--outline" disabled={pending}>
            Reverse selected credit
          </button>
        </form>
      ) : null}
      <button
        className="button button--outline"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            await reload();
            setMessage("Invoice reloaded.");
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Service unavailable.");
          } finally {
            setPending(false);
          }
        }}
      >
        Reload invoice
      </button>
      <p role="status">{pending ? "Saving…" : message}</p>
      {i.shop_id && !operator ? (
        <Link className="button" href={`/shopkeeper/shops/${i.shop_id}`}>
          Open your shop workspace
        </Link>
      ) : null}
      <h2>Recent ledger events</h2>
      {data.events.length ? (
        <ul className="ledger-events">
          {data.events.map((e) => (
            <li key={e.id}>
              <strong>
                {e.kind} · {formatSignedMinorMoney(e.amount_minor, i.currency)}
              </strong>
              <span className="break-anywhere">{e.source_reference}</span>
              <span>{e.reason}</span>
              <span>
                {e.reversed ? "Reversed by a later event" : "Recorded"} ·{" "}
                {new Date(e.created_at).toISOString()}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No credits have been recorded.</p>
      )}
    </div>
  );
}
