"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { ContactSnapshot, OwnerIncidentView, OperatorIncidentView } from "@/server/incidents";
const errors: Record<string, string> = {
  stale_version: "The incident or contact version changed. Reload and review before retrying.",
  incident_assigned: "Another reviewer is responsible for this incident.",
  incident_closed: "This incident is already closed.",
  fresh_authentication_required: "Sign in again or verify fresh MFA, then reload.",
  owner_confirmation_required:
    "The original owner must confirm the exact restoration again with current authentication and contact version.",
  account_already_contained: "This incident already revoked the account’s prior sessions.",
  reporter_authority_changed:
    "The reporting owner no longer has current authority; escalate the incident.",
  restore_confirmation_denied: "Only the original reporting owner can confirm this restoration.",
  resource_unavailable: "This incident is unavailable to your current access.",
  incident_action_denied: "This incident grants no authority for that action.",
  request_key_conflict:
    "This retry differs from the saved incident. Reload before creating another request.",
};
async function checked(r: Response) {
  const body = await r.json();
  if (!r.ok)
    throw Error(
      errors[body.error] ?? "This action could not complete. Check your access and reload.",
    );
  return body;
}
async function post(path: string, body: unknown) {
  return checked(
    await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
const date = (v: Date | string) =>
  new Date(v).toLocaleString("en-UG", { timeZone: "Africa/Kampala" });
function Feedback({ status, error }: { status: string; error: string }) {
  return (
    <>
      <p role="status">{status}</p>
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}
export function ContactRevision({ value }: { value: ContactSnapshot }) {
  return (
    <section>
      <h2>Requested contact revision {value.version}</h2>
      <dl>
        <dt>Telephone</dt>
        <dd>{value.phone || "None"}</dd>
        <dt>WhatsApp</dt>
        <dd>{value.whatsapp || "None"}</dd>
        <dt>Website</dt>
        <dd className="trust-text">{value.website || "None"}</dd>
        <dt>Fulfilment</dt>
        <dd>{value.fulfilment}</dd>
        <dt>Payment instructions</dt>
        <dd className="trust-text">{value.payment_instructions || "None"}</dd>
        <dt>Delivery instructions</dt>
        <dd className="trust-text">{value.delivery_instructions || "None"}</dd>
        <dt>Enquiries</dt>
        <dd>{value.enquiries_enabled ? "Enabled" : "Disabled"}</dd>
      </dl>
    </section>
  );
}
export function CreateIncidentForm({
  shopId,
  contacts,
}: {
  shopId: string;
  contacts: ContactSnapshot[];
}) {
  const key = useRef<string | null>(null),
    [kind, setKind] = useState("support"),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const current = contacts[0]?.version ?? 0,
    earlier = contacts.filter((c) => c.version < current);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    try {
      key.current ??= crypto.randomUUID();
      const r = await post(`/api/workspace/shops/${shopId}/incidents`, {
        key: key.current,
        kind,
        message: d.get("message"),
        contactVersion: kind === "contact_change" ? current : null,
        requestedRevision: kind === "contact_change" ? Number(d.get("revision")) : null,
        confirm: d.get("confirm") === "on",
      });
      window.location.assign(`/shopkeeper/shops/${shopId}/incidents/${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Incident unavailable.");
      setPending(false);
    }
  }
  return (
    <form className="account-form" onSubmit={submit} aria-label="Open an incident">
      <label htmlFor="incident-kind">Incident category</label>
      <select id="incident-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="support">Support</option>
        <option value="security">Account security</option>
        <option value="account_recovery">Account recovery</option>
        <option value="contact_change" disabled={!earlier.length}>
          Contact or payment-instruction change
        </option>
        <option value="fraud">Fraud concern</option>
        <option value="payment_exception">Rent payment exception</option>
        <option value="verification">Application verification</option>
      </select>
      <label htmlFor="incident-message">Describe the incident</label>
      <textarea
        id="incident-message"
        name="message"
        required
        minLength={10}
        maxLength={2000}
        rows={5}
      />
      <p>
        Use fictional development details. Do not include passwords, recovery codes, identity
        documents or payment credentials.
      </p>
      {kind === "contact_change" ? (
        <>
          <label htmlFor="incident-revision">Earlier contact revision to request</label>
          <select id="incident-revision" name="revision" required>
            {earlier.map((c) => (
              <option key={c.version} value={c.version}>
                Revision {c.version} · {date(c.captured_at)} · {c.phone || "No telephone"}
              </option>
            ))}
          </select>
          <p>
            The reviewer can restore only this exact revision after your separate confirmation.
            History begins at the recorded upgrade baseline.
          </p>
        </>
      ) : null}
      <label className="checkbox-label">
        <input name="confirm" type="checkbox" required /> I confirm this fictional incident request.
      </label>
      <button className="button" disabled={pending}>
        {pending ? "Sending…" : "Open incident"}
      </button>
      <Feedback status="" error={error} />
    </form>
  );
}
export function IncidentClaimForm({ id, version }: { id: string; version: number }) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    try {
      await post(`/api/operator/incidents/${id}/claim`, {
        version,
        reason: d.get("reason"),
        confirm: d.get("confirm") === "on",
      });
      window.location.assign(`/landlord/incidents/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim unavailable.");
      setPending(false);
    }
  }
  return (
    <form className="account-form" onSubmit={submit} aria-label="Claim an incident">
      <label htmlFor={`incident-claim-${id}`}>Assignment reason</label>
      <input id={`incident-claim-${id}`} name="reason" required minLength={5} maxLength={500} />
      <label className="checkbox-label">
        <input type="checkbox" name="confirm" required /> I accept responsibility for this incident.
      </label>
      <button className="button" disabled={pending}>
        Claim incident
      </button>
      <Feedback status="" error={error} />
    </form>
  );
}
export function OwnerIncidentPanel({
  shopId,
  initial,
}: {
  shopId: string;
  initial: OwnerIncidentView;
}) {
  const [view, setView] = useState(initial),
    [pending, setPending] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const root = `/api/workspace/shops/${shopId}/incidents/${view.case.id}`,
    closed = ["resolved", "cancelled"].includes(view.case.state);
  async function reload() {
    setView(await checked(await fetch(root, { cache: "no-store" })));
  }
  async function command(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget),
      action = d.get("action");
    setPending(true);
    setError("");
    setStatus("Saving incident request…");
    try {
      await post(root, {
        action,
        version: view.case.version,
        contactVersion: action === "confirm_restore" ? view.contactVersion : null,
        reason: d.get("reason"),
        confirm: d.get("confirm") === "on",
      });
      await reload();
      setStatus(
        action === "confirm_restore"
          ? "Exact restoration confirmed for scoped review. Approval lasts 30 minutes and requires unchanged account security and contact version."
          : "Incident cancelled. Prior security actions and history remain.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request unavailable.");
      setStatus("");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="catalogue-workspace">
      <p>
        Category: {view.case.kind}; state: {view.case.state}; priority: {view.case.priority}.
      </p>
      <p className="trust-text">{view.case.message}</p>
      <p className="trust-text">{view.case.public_reason || "No reviewer explanation yet."}</p>
      {view.case.contained_at ? (
        <p>
          Prior account sessions were revoked. Use native password recovery and your authenticator
          or recovery code before confirming sensitive changes.
        </p>
      ) : null}
      <div className="account-links">
        <Link href="/recover">Native password recovery</Link>
        <Link href="/security">Account security and MFA</Link>
      </div>
      <button
        className="button button--outline"
        disabled={pending}
        onClick={() =>
          void reload().catch(() => setError("Reload unavailable. Sign in again and check access."))
        }
      >
        Reload incident
      </button>
      {view.requested ? (
        <>
          <ContactRevision value={view.requested} />
          <p>
            Current contact revision: {view.contactVersion}. Confirmation authorizes this exact
            historical content to become a new revision; it never rewrites earlier history.
          </p>
        </>
      ) : null}
      {!closed ? (
        <form className="account-form" aria-label="Owner incident action" onSubmit={command}>
          <label htmlFor="owner-incident-action">Owner action</label>
          <select id="owner-incident-action" name="action">
            <option value="cancel">Cancel this incident</option>
            {view.canConfirm && view.requested ? (
              <option value="confirm_restore">Confirm exact contact restoration</option>
            ) : null}
          </select>
          <label htmlFor="owner-incident-reason">Owner action reason</label>
          <input id="owner-incident-reason" name="reason" required minLength={5} maxLength={500} />
          <label className="checkbox-label">
            <input type="checkbox" name="confirm" required /> I reviewed this incident and confirm
            my selected action.
          </label>
          <button className="button" disabled={pending}>
            Save owner action
          </button>
        </form>
      ) : null}
      <Feedback status={status} error={error} />
      <h2>Merchant-facing incident history</h2>
      <ul className="workspace-list">
        {view.events.map((e, i) => (
          <li key={i}>
            <strong>{e.kind}</strong> · {date(e.created_at)}
            <p className="trust-text">{e.public_reason}</p>
          </li>
        ))}
      </ul>
      <p>
        Private investigation notes and reviewer identities are excluded. This local service cannot
        replace lost-factor identity adjudication or live emergency support.
      </p>
    </div>
  );
}
export function OperatorIncidentPanel({ initial }: { initial: OperatorIncidentView }) {
  const [view, setView] = useState(initial),
    [pending, setPending] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [action, setAction] = useState("note");
  const root = `/api/operator/incidents/${view.case.id}`,
    recovery = ["security", "account_recovery", "contact_change"].includes(view.case.kind),
    closed = ["resolved", "cancelled"].includes(view.case.state);
  async function reload() {
    setView(await checked(await fetch(root, { cache: "no-store" })));
  }
  async function command(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setPending(true);
    setStatus("Saving incident action…");
    setError("");
    try {
      const r = await post(root, {
        version: view.case.version,
        action,
        priority: Number(d.get("priority")),
        reason: d.get("reason"),
        publicReason: d.get("publicReason"),
        confirm: d.get("confirm") === "on",
      });
      if (r.state === "escalated") {
        window.location.assign("/landlord/incidents");
        return;
      }
      await reload();
      setStatus("Incident action recorded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Command unavailable.");
      setStatus("");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="catalogue-workspace">
      <p>
        Category: {view.case.kind}; state: {view.case.state}; priority: {view.case.priority}. You
        are the assigned reviewer.
      </p>
      <p>
        Investigate before acting. Escalation releases your assignment and private access for
        another qualified reviewer. Fraud, finance and verification decisions use their existing
        separate scopes.
      </p>
      <div className="account-links">
        <Link href="/landlord/trust">Trust review</Link>
        <Link href="/landlord/rent-exceptions">Finance exceptions</Link>
        <Link href="/landlord/applications">Application review</Link>
      </div>
      <h2>Private incident report</h2>
      <p className="trust-text">{view.case.message}</p>
      <p>
        Reporting owner remains active: {view.reporterActive ? "Yes" : "No"}. Prior sessions
        contained: {view.case.contained_at ? "Yes" : "No"}.
      </p>
      <button
        className="button button--outline"
        disabled={pending}
        onClick={() =>
          void reload().catch(() =>
            setError("Reload unavailable. Verify fresh MFA and current assignment."),
          )
        }
      >
        Reload assigned incident
      </button>
      {view.requested ? (
        <>
          <ContactRevision value={view.requested} />
          <p>
            Current contact revision: {view.contactVersion}. Current owner confirmation:{" "}
            {view.approvalValid ? "Valid" : "Required or expired"}.
          </p>
        </>
      ) : null}
      {!closed ? (
        <form className="account-form" onSubmit={command} aria-label="Assigned incident action">
          <label htmlFor="operator-incident-action">Incident action</label>
          <select
            id="operator-incident-action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="note">Record private note and priority</option>
            <option value="escalate">Escalate and release assignment</option>
            <option value="resolve">Resolve with explanation</option>
            {recovery ? (
              <option value="contain_sessions" disabled={!!view.case.contained_at}>
                Revoke reporting owner’s prior sessions
              </option>
            ) : null}
            {view.requested ? (
              <option value="restore_contacts">
                Restore owner-confirmed exact contact revision
              </option>
            ) : null}
          </select>
          <label htmlFor="incident-priority">Incident priority</label>
          <select id="incident-priority" name="priority" defaultValue={view.case.priority}>
            <option value="0">Normal</option>
            <option value="1">Elevated</option>
            <option value="2">High</option>
          </select>
          <label htmlFor="incident-private-reason">Private investigation reason</label>
          <textarea
            id="incident-private-reason"
            name="reason"
            required
            minLength={5}
            maxLength={2000}
            rows={4}
          />
          <label htmlFor="incident-public-reason">Explanation for shop owners</label>
          <textarea
            id="incident-public-reason"
            name="publicReason"
            required={action !== "note"}
            minLength={action === "note" ? 0 : 5}
            maxLength={500}
            rows={3}
          />
          <p>
            Exclude private evidence and credentials. Session containment changes no password, MFA,
            ownership, rent or shop visibility. Contact restoration requires the reporting owner’s
            fresh exact confirmation.
          </p>
          <label className="checkbox-label">
            <input type="checkbox" name="confirm" required /> I reviewed authority, current versions
            and the impact of this incident action.
          </label>
          <button className="button" disabled={pending}>
            Save incident action
          </button>
        </form>
      ) : null}
      <Feedback status={status} error={error} />
      <h2>Private incident history</h2>
      <ul className="workspace-list">
        {view.events.map((e, i) => (
          <li key={i}>
            <strong>{e.kind}</strong> · {date(e.created_at)}
            <p className="trust-text">{e.reason}</p>
            {e.public_reason ? (
              <p className="trust-text">Owner explanation: {e.public_reason}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
