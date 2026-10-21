"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { TrustView, OwnerTrustView } from "@/server/trust";

const messages: Record<string, string> = {
  fresh_authentication_required: "Sign in again or verify a fresh MFA code, then reload.",
  stale_version: "The case changed. Reload and review before retrying.",
  independent_review_required: "A different authorized reviewer must resolve this restriction.",
  resource_unavailable: "This record or attachment is unavailable to your current access.",
  rate_limit_exceeded: "Too many requests. Wait a minute before retrying.",
  origin_denied: "Open this form from the configured Londos site.",
  invalid_evidence_image: "Use a valid single-frame JPEG, PNG or WebP image, up to 2 MiB.",
  attachment_already_saved: "An attachment is already saved. It cannot be replaced.",
  moderation_changed_externally:
    "Moderation changed outside this workflow. Escalate before making another decision.",
  appeal_already_pending: "An appeal is already pending or the appeal limit was reached.",
  report_capacity: "The reporting queue is full. Try again later.",
};
async function checked(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "unavailable" }));
    throw new Error(
      messages[body.error] ?? "This action could not be completed. Check your access and reload.",
    );
  }
  return response.json();
}
async function post(path: string, value: unknown) {
  return checked(
    await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    }),
  );
}
function date(value: Date | string) {
  return new Date(value).toLocaleString("en-UG", { timeZone: "Africa/Kampala" });
}
function ErrorText({ text }: { text: string }) {
  return text ? <p role="alert">{text}</p> : null;
}

export function PublicReportForm({ shopId }: { shopId: string }) {
  const receipt = useRef<{ key: string; capability: string } | null>(null),
    file = useRef<File | null>(null);
  const [pending, setPending] = useState(false),
    [received, setReceived] = useState(false),
    [reference, setReference] = useState(""),
    [done, setDone] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      if (!receipt.current) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        receipt.current = {
          key: crypto.randomUUID(),
          capability: btoa(String.fromCharCode(...bytes))
            .replaceAll("+", "-")
            .replaceAll("/", "_")
            .replaceAll("=", ""),
        };
      }
      const data = new FormData(event.currentTarget),
        candidate = data.get("image");
      if (!received) {
        if (candidate instanceof File && candidate.size) {
          if (candidate.size > 2097152) throw new Error("Choose an image up to 2 MiB.");
          file.current = candidate;
        }
        await post("/api/guest/reports", {
          ...receipt.current,
          shopId,
          category: data.get("category"),
          message: data.get("message"),
        });
        setReceived(true);
        setReference(receipt.current.key);
        setStatus("Report received. A receipt does not promise a decision or response time.");
      }
      if (file.current) {
        await checked(
          await fetch(`/api/guest/reports/${receipt.current.key}/evidence`, {
            method: "POST",
            headers: {
              "content-type": file.current.type,
              authorization: `Bearer ${receipt.current.capability}`,
            },
            body: file.current,
          }),
        );
        setStatus(
          "Report and private image received. A receipt does not promise a decision or response time.",
        );
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Report unavailable.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="account-form" onSubmit={submit} aria-label="Report a shop concern">
      <fieldset disabled={received || pending}>
        <legend>Your concern</legend>
        <label htmlFor="report-category">Concern category</label>
        <select id="report-category" name="category" defaultValue="content">
          <option value="content">Shop content</option>
          <option value="product">Product or service</option>
          <option value="payment">Merchant payment concern</option>
          <option value="privacy">Privacy</option>
          <option value="other">Other</option>
        </select>
        <label htmlFor="report-message">What happened?</label>
        <textarea
          id="report-message"
          name="message"
          minLength={10}
          maxLength={2000}
          rows={5}
          required
        />
        <label htmlFor="report-image">Optional private image</label>
        <input
          id="report-image"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
        />
        <p>
          Up to 2 MiB. Do not include passwords, identity documents or payment credentials. Your
          report and image are private to authorized trust reviewers.
        </p>
        <label className="checkbox-label">
          <input type="checkbox" required /> I have checked this report and believe the information
          is accurate.
        </label>
      </fieldset>
      <button className="button" disabled={pending || done} type="submit">
        {pending ? "Sending…" : received ? "Retry private image" : "Send concern"}
      </button>
      <p role="status">{status}</p>
      {received && reference ? (
        <section className="report-receipt" aria-label="Submission receipt">
          <h2>Your submission receipt</h2>
          <p>
            Submission reference: <code className="break-anywhere">{reference}</code>
          </p>
          <p>
            Keep a copy for correspondence. This is not a public tracking link or a decision about
            the shop.
          </p>
          <button
            type="button"
            className="button button--outline"
            onClick={() => {
              const content = `Londos concern submission\nReference: ${reference}\nReceipt acknowledged. This does not promise a decision or response time.\n`;
              const url = URL.createObjectURL(
                new Blob([content], { type: "text/plain;charset=utf-8" }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "londos-submission-receipt.txt";
              document.body.appendChild(link);
              link.click();
              link.remove();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Save receipt
          </button>
        </section>
      ) : null}
      <ErrorText text={error} />
      <p>
        No customer account is required. Keep this page open to retry an attachment; closing it
        discards its private upload access.
      </p>
    </form>
  );
}
export function ClaimTrustForm({ id }: { id: string }) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await post(`/api/operator/trust/${id}/claim`, {
        reason: data.get("reason"),
        confirm: data.get("confirm") === "on",
      });
      window.location.assign(`/landlord/trust/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim unavailable.");
      setPending(false);
    }
  }
  return (
    <form className="account-form" onSubmit={submit} aria-label={`Claim case ${id.slice(0, 8)}`}>
      <label htmlFor={`claim-${id}`}>Claim reason</label>
      <input id={`claim-${id}`} name="reason" minLength={5} maxLength={500} required />
      <label className="checkbox-label">
        <input type="checkbox" name="confirm" required /> I confirm this scoped trust assignment.
      </label>
      <button className="button" disabled={pending}>
        Claim trust case
      </button>
      <ErrorText text={error} />
    </form>
  );
}
export function TrustCasePanel({ initial }: { initial: TrustView }) {
  const [view, setView] = useState(initial),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const id = view.case.id,
    base = `/api/operator/trust/${id}`;
  async function reload() {
    setView(await checked(await fetch(base)));
  }
  async function command(event: FormEvent<HTMLFormElement>, kind: "notes" | "decision") {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await post(
        `${base}/${kind}`,
        kind === "notes"
          ? {
              version: view.case.version,
              priority: Number(data.get("priority")),
              reason: data.get("reason"),
              confirm: data.get("confirm") === "on",
            }
          : {
              action: data.get("action"),
              version: view.case.version,
              moderationVersion: view.moderation.version,
              reason: data.get("reason"),
              publicReason: data.get("publicReason"),
              confirm: data.get("confirm") === "on",
            },
      );
      await reload();
      setStatus(
        kind === "notes" ? "Private investigation note saved." : "Reasoned trust decision saved.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action unavailable.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <p>
        Case: {view.case.state}; shop moderation: {view.moderation.state}.{" "}
        {view.appealPending ? "An owner appeal awaits independent review." : ""}
      </p>
      <p>
        Restoration removes only this case’s restriction. Other cases, rent, publication and
        administrative holds remain authoritative.
      </p>
      <button
        className="button button--outline"
        disabled={pending}
        onClick={async () => {
          setError("");
          try {
            await reload();
            setStatus("Current trust case reloaded.");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Reload unavailable.");
          }
        }}
      >
        Reload trust case
      </button>
      <section>
        <h2>Private report</h2>
        <p>Category: {view.report.category}</p>
        <p className="trust-text">{view.report.message}</p>
        {view.evidence ? (
          <a href={`${base}/evidence`} target="_blank" rel="noreferrer noopener">
            Open private report image
          </a>
        ) : (
          <p>No report image attached.</p>
        )}
      </section>
      <h2>Investigation</h2>
      <form
        className="account-form"
        onSubmit={(e) => void command(e, "notes")}
        aria-label="Private investigation note"
      >
        <label htmlFor="trust-priority">Queue priority</label>
        <select id="trust-priority" name="priority" defaultValue={view.case.priority}>
          <option value="0">Normal</option>
          <option value="1">High</option>
          <option value="2">Urgent</option>
        </select>
        <label htmlFor="trust-note">Private investigation note</label>
        <textarea id="trust-note" name="reason" minLength={5} maxLength={2000} rows={4} required />
        <label className="checkbox-label">
          <input type="checkbox" name="confirm" required /> I confirm this private investigation
          record.
        </label>
        <button
          className="button"
          disabled={pending || ["dismissed", "reinstated"].includes(view.case.state)}
        >
          Save private note
        </button>
      </form>
      <h2>Reasoned decision</h2>
      <form
        className="account-form"
        onSubmit={(e) => void command(e, "decision")}
        aria-label="Trust decision"
      >
        <label htmlFor="trust-action">Trust action</label>
        <select id="trust-action" name="action" defaultValue="review">
          <option value="review">Review and temporarily hide</option>
          <option value="suspend">Suspend this case</option>
          <option value="dismiss">Dismiss this case</option>
          <option value="reinstate">Reinstate after independent review</option>
        </select>
        <label htmlFor="trust-private-reason">Private decision reason</label>
        <textarea id="trust-private-reason" name="reason" minLength={5} maxLength={500} required />
        <label htmlFor="trust-public-reason">Explanation for the merchant</label>
        <textarea
          id="trust-public-reason"
          name="publicReason"
          minLength={5}
          maxLength={500}
          required
        />
        <p>
          Exclude reporter identity, private evidence and investigation details from the merchant
          explanation.
        </p>
        <label className="checkbox-label">
          <input type="checkbox" name="confirm" required /> I reviewed the evidence, current state
          and merchant explanation.
        </label>
        <button
          className="button"
          disabled={pending || ["dismissed", "reinstated"].includes(view.case.state)}
        >
          Save trust decision
        </button>
      </form>
      <p role="status">{status}</p>
      <ErrorText text={error} />
      <Link href="/security">Account security</Link>
      <h2>Private case history</h2>
      <ul className="workspace-list">
        {view.events.map((e) => (
          <li key={e.id}>
            <strong>{e.kind}</strong> · {date(e.created_at)}
            <p className="trust-text">{e.reason}</p>
            {e.public_reason ? <p>Merchant explanation: {e.public_reason}</p> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
export function OwnerTrustPanel({ shopId, initial }: { shopId: string; initial: OwnerTrustView }) {
  const [view, setView] = useState(initial),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  async function reload() {
    setView(await checked(await fetch(`/api/workspace/shops/${shopId}/trust?page=${view.page}`)));
  }
  async function appeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      selected = view.cases.find((c) => c.id === data.get("caseId"));
    if (!selected) return;
    setPending(true);
    setError("");
    try {
      await post(`/api/workspace/shops/${shopId}/trust/${selected.id}/appeal`, {
        version: selected.version,
        reason: data.get("reason"),
        confirm: data.get("confirm") === "on",
      });
      await reload();
      setStatus(
        "Appeal recorded for independent review. Your current restriction remains until a reasoned decision.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Appeal unavailable.");
    } finally {
      setPending(false);
    }
  }
  const appealable = view.cases.filter(
    (c) => ["reviewing", "suspended"].includes(c.state) && !c.appeal_pending,
  );
  return (
    <>
      <p>Current shop moderation: {view.moderation.state}.</p>
      <p>
        Reporter details and private investigation evidence are not shared. Review the explanation
        and submit relevant information if you disagree.
      </p>
      <button
        className="button button--outline"
        disabled={pending}
        onClick={async () => {
          try {
            await reload();
            setError("");
            setStatus("Current trust decisions reloaded.");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Reload unavailable.");
          }
        }}
      >
        Reload trust decisions
      </button>
      <ul className="workspace-list">
        {view.cases.map((c) => (
          <li key={c.id}>
            <strong>
              Case {c.id.slice(0, 8)} · {c.state}
            </strong>
            <p>{c.public_reason}</p>
            <p>
              {date(c.created_at)}
              {c.appeal_pending ? " · Appeal pending" : ""}
            </p>
          </li>
        ))}
      </ul>
      {!view.cases.length ? <p>No trust decision has been issued for this shop.</p> : null}
      {appealable.length ? (
        <form className="account-form" onSubmit={appeal} aria-label="Appeal a trust decision">
          <h2>Request independent review</h2>
          <label htmlFor="appeal-case">Decision to appeal</label>
          <select id="appeal-case" name="caseId">
            {appealable.map((c) => (
              <option key={c.id} value={c.id}>
                Case {c.id.slice(0, 8)} · {c.state}
              </option>
            ))}
          </select>
          <label htmlFor="appeal-reason">Appeal explanation</label>
          <textarea
            id="appeal-reason"
            name="reason"
            minLength={10}
            maxLength={2000}
            rows={4}
            required
          />
          <label className="checkbox-label">
            <input type="checkbox" name="confirm" required /> I reviewed the explanation and confirm
            this appeal.
          </label>
          <button className="button" disabled={pending}>
            Send appeal
          </button>
        </form>
      ) : null}
      <p role="status">{status}</p>
      <ErrorText text={error} />
    </>
  );
}
