"use client";
import { useState, useRef, type FormEvent } from "react";
import type { privacyInventory } from "@/server/privacy";
import type { PrivacyKind } from "@/modules/privacy/contract";
type Inventory = Awaited<ReturnType<typeof privacyInventory>>;
export function PrivacyWorkspace({ initial }: { initial: Inventory }) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [section, setSection] = useState("shops"),
    [after, setAfter] = useState<string | null>(null);
  const pendingRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const base = `/api/workspace/merchants/${data.merchantId}/privacy`;
  async function write(path: string, body: unknown) {
    const response = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error ??
          "Privacy action unavailable. Sign in again if fresh authentication is required.",
      );
    return result;
  }
  async function act(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setNotice("");
    try {
      await work();
      const r = await fetch(base);
      const value = await r.json();
      if (!r.ok) throw new Error(value.error ?? "Refresh unavailable.");
      setData(value);
      setNotice(message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Privacy action unavailable.");
    } finally {
      setBusy(false);
    }
  }
  function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    const [kind, target] = String(values.get("target")).split(":");
    const fingerprint = JSON.stringify([kind, target, values.get("reason"), values.get("confirm")]);
    if (pendingRequest.current?.fingerprint !== fingerprint)
      pendingRequest.current = { fingerprint, key: crypto.randomUUID() };
    const key = pendingRequest.current.key;
    void act(async () => {
      await write("", {
        action: "request",
        key,
        kind: kind as PrivacyKind,
        target,
        reason: values.get("reason"),
        confirm: values.get("confirm") === "on",
      });
      pendingRequest.current = null;
      form.reset();
    }, "Request recorded. Manual review is required; no data has been erased.");
  }
  async function download(next: boolean) {
    setBusy(true);
    setNotice("");
    try {
      const value = await write("/export", { section, after: next ? after : null, confirm: true });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `londos-${section}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setAfter(value.nextAfter);
      setNotice(
        value.nextAfter
          ? "This section has more data. Download its next page to continue."
          : "This section's final page has downloaded.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Download unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="notice">
        {data.policy} Automatic deletion is{" "}
        {data.erasureEnabled ? "enabled for reviewed development records" : "disabled"}.
      </p>
      <p>
        Customer enquiry content, private investigation, other members' identities and account
        secrets are excluded from these business exports. Application profiles and incident messages
        belong to your own submissions. Retention holds and required history can prevent erasure.
        Rent closure never deletes data.
      </p>
      <h2>Download your business data</h2>
      <p>
        Each download is a bounded current section. It is not a complete account or legal
        subject-access response. No download file or bearer link is stored on the server.
      </p>
      <label htmlFor="privacy-export-section">Export section</label>
      <select
        id="privacy-export-section"
        value={section}
        onChange={(e) => {
          setSection(e.target.value);
          setAfter(null);
        }}
      >
        <option value="shops">Shop profiles</option>
        <option value="departments">Departments</option>
        <option value="catalogue">Catalogue</option>
        <option value="contacts">Current business contacts</option>
        <option value="invoices">Invoice summaries</option>
        <option value="applications">Your application profiles</option>
        <option value="incidents">Your incident messages</option>
        <option value="analytics">Retained shop analytics</option>
      </select>
      <div className="account-links">
        <button className="button" disabled={busy} onClick={() => void download(false)}>
          Download section
        </button>
        {after ? (
          <button
            className="button button--outline"
            disabled={busy}
            onClick={() => void download(true)}
          >
            Download next page
          </button>
        ) : null}
      </div>
      <h2>Request reviewed erasure</h2>
      <p>
        Closed enquiry content and rejected-application evidence need at least 30 days since
        closure/rejection. Financially referenced applications and protected history remain
        retained. Analytics erasure also permanently stops future shop capture. Primary erasure
        cannot be undone; backups, notifications, previous downloads and third-party copies are
        outside this result.
      </p>
      <form className="account-form" onSubmit={request}>
        <label htmlFor="privacy-target">Data to review</label>
        <select id="privacy-target" name="target" required defaultValue="">
          <option value="" disabled>
            Choose a record
          </option>
          <optgroup label="Shop analytics">
            {data.shops
              .filter((s) => !s.capture_stopped)
              .map((s) => (
                <option key={s.id} value={`analytics:${s.id}`}>
                  {s.name}: erase analytics and stop capture
                </option>
              ))}
          </optgroup>
          <optgroup label="Customer enquiry content">
            {data.enquiries
              .filter((r) => !r.erased_at)
              .map((r) => (
                <option key={r.id} value={`enquiry:${r.id}`}>
                  {r.kind} {r.id.slice(0, 8)}: {r.status}
                </option>
              ))}
          </optgroup>
          <optgroup label="Your application evidence">
            {data.applications.map((a) => (
              <option key={a.id} value={`verification:${a.id}`}>
                {a.business_name}: {a.state}
              </option>
            ))}
          </optgroup>
          <optgroup label="Protected history (retained)">
            {data.shops.map((s) => (
              <option key={s.id} value={`history:${s.id}`}>
                Required history for {s.name}
              </option>
            ))}
          </optgroup>
        </select>
        <label htmlFor="privacy-reason">Why are you requesting this review?</label>
        <textarea
          id="privacy-reason"
          name="reason"
          required
          minLength={5}
          maxLength={500}
          rows={3}
          aria-describedby="privacy-reason-help"
        />
        <p id="privacy-reason-help">
          Give a short reason. Do not include passwords, evidence or customer contact details.
        </p>
        <label className="checkbox-label">
          <input type="checkbox" name="confirm" required /> I understand that review and retention
          conditions apply; this request does not itself erase data.
        </label>
        <button className="button" disabled={busy}>
          Request privacy review
        </button>
      </form>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      <h2>Your recent privacy requests</h2>
      {!data.requests.length ? (
        <p>No privacy requests yet.</p>
      ) : (
        <ul className="workspace-list">
          {data.requests.map((r) => (
            <li key={r.id}>
              <h3>
                {r.kind} · {r.state}
              </h3>
              <p>{r.public_reason || "Awaiting manual review."}</p>
              {r.result.primaryDataErased === true ? (
                <p>
                  Primary SQL erasure verified. Backup and external-copy erasure has not been
                  verified.
                </p>
              ) : null}
              <ul>
                {r.events.map((e, i) => (
                  <li key={i}>
                    {e.kind}: {e.public_reason || "Review activity recorded."}
                  </li>
                ))}
              </ul>
              {["requested", "reviewing", "held"].includes(r.state) ? (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () =>
                        write("", {
                          action: "cancel",
                          id: r.id,
                          version: r.version,
                          reason: "Owner cancelled this privacy request.",
                          confirm: true,
                        }),
                      "Request cancelled. Any active retention hold remains.",
                    )
                  }
                >
                  Cancel {r.kind} request
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p>{data.limit}</p>
    </>
  );
}
