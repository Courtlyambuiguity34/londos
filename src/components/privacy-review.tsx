"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { privacyQueue, readPrivacy } from "@/server/privacy";
async function post(path: string, body: unknown) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await r.json();
  if (!r.ok) throw new Error(value.error ?? "Privacy action unavailable.");
  return value;
}
export function PrivacyQueue({ initial }: { initial: Awaited<ReturnType<typeof privacyQueue>> }) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const router = useRouter();
  function claim(event: FormEvent<HTMLFormElement>, id: string, version: number) {
    event.preventDefault();
    const v = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    void post(`/api/operator/privacy/${id}/claim`, {
      version,
      reason: v.get("reason"),
      confirm: v.get("confirm") === "on",
    })
      .then(() => {
        router.push(`/landlord/privacy/${id}`);
        router.refresh();
      })
      .catch((e) => {
        setNotice(e instanceof Error ? e.message : "Claim unavailable.");
        setBusy(false);
      });
  }
  return (
    <>
      <p>
        Only the assigned privacy reviewer may inspect a request or decide it. Other workflow
        permissions do not grant privacy access. This queue shows at most 20 open requests, oldest
        first.
      </p>
      <p role="status">{notice}</p>
      {!initial.length ? (
        <p>No open privacy requests.</p>
      ) : (
        <ul className="workspace-list">
          {initial.map((r) => (
            <li key={r.id}>
              <h2>
                {r.kind} · {r.state}
              </h2>
              {r.assigned_to_you ? (
                <Link href={`/landlord/privacy/${r.id}`}>Review assigned {r.kind} request</Link>
              ) : (
                <form className="account-form" onSubmit={(e) => claim(e, r.id, r.version)}>
                  <label htmlFor={`claim-${r.id}`}>Assignment reason</label>
                  <input
                    id={`claim-${r.id}`}
                    name="reason"
                    required
                    minLength={5}
                    maxLength={500}
                  />
                  <label className="checkbox-label">
                    <input type="checkbox" name="confirm" required /> I accept responsibility for
                    this scoped privacy review.
                  </label>
                  <button className="button" disabled={busy}>
                    Claim {r.kind} review
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
export function PrivacyReview({ initial }: { initial: Awaited<ReturnType<typeof readPrivacy>> }) {
  const router = useRouter();
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const r = data.request,
    done = ["completed", "denied", "cancelled"].includes(r.state);
  async function refresh() {
    const response = await fetch(`/api/operator/privacy/${r.id}`);
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? "Refresh unavailable.");
    setData(value);
  }
  function command(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      v = new FormData(form);
    setBusy(true);
    setNotice("");
    void post(`/api/operator/privacy/${r.id}`, {
      action: v.get("action"),
      version: r.version,
      reason: v.get("reason"),
      explanation: v.get("explanation"),
      confirm: v.get("confirm") === "on",
    })
      .then(async () => {
        if (v.get("action") === "unassign") {
          router.push("/landlord/privacy");
          router.refresh();
          return;
        }
        await refresh();
        setNotice(
          "Decision recorded. Approval queues a guarded worker operation; it is not a completion claim.",
        );
        form.reset();
      })
      .catch((e) => setNotice(e instanceof Error ? e.message : "Decision unavailable."))
      .finally(() => setBusy(false));
  }
  return (
    <>
      <p className="notice">
        {r.kind} · {r.state}. Automatic deletion is{" "}
        {data.erasureEnabled ? "enabled for reviewed fictional records" : "disabled"}.
      </p>
      <h2>Owner's request</h2>
      <p className="request-message">{r.requester_reason}</p>
      <h2>Current eligibility</h2>
      <p>{data.target.reason}</p>
      <p>
        Primary records in this plan: {data.target.records}. No private source content is exposed
        here.
      </p>
      <p>
        Execution: {data.execution}. Every approved effect rechecks current authority, holds,
        age/state and the exact target plan. Approval lasts five minutes; changed conditions require
        fresh review.
      </p>
      <p>
        Required financial, contact and investigation history is retained. Primary SQL effects do
        not erase backups, notifications, previous downloads or third-party copies. Do not describe
        this as complete account or legal erasure.
      </p>
      {r.result.primaryDataErased === true ? (
        <p className="notice">
          Primary SQL erasure verified; backup and external-copy obligations remain.
        </p>
      ) : null}
      {r.result.manualReviewCompleted === true ? (
        <p className="notice">Manual review completed. This action did not delete data.</p>
      ) : null}
      {!done ? (
        <form className="account-form" onSubmit={command}>
          <label htmlFor="privacy-action">Review decision</label>
          <select id="privacy-action" name="action" defaultValue="deny">
            <option
              value="resolve"
              disabled={r.state === "approved" || data.holds.some((h) => !h.released_at)}
            >
              Complete manual review (does not delete data)
            </option>
            <option value="deny">Retain data / deny erasure</option>
            <option value="hold">Place a retention hold</option>
            <option value="unassign">Release assignment for another reviewer</option>
            <option value="release" disabled={!data.holds.some((h) => !h.released_at)}>
              Release the retention hold
            </option>
            <option value="approve" disabled={!data.erasureEnabled || !data.target.eligible}>
              Approve this primary erasure plan
            </option>
          </select>
          <label htmlFor="privacy-private-reason">Private review reason</label>
          <textarea
            id="privacy-private-reason"
            name="reason"
            required
            minLength={5}
            maxLength={500}
            rows={3}
          />
          <label htmlFor="privacy-public-reason">Owner-visible explanation</label>
          <textarea
            id="privacy-public-reason"
            name="explanation"
            required
            minLength={5}
            maxLength={500}
            rows={3}
          />
          <label className="checkbox-label">
            <input type="checkbox" name="confirm" required /> I confirm this versioned decision and
            its owner-visible explanation.
          </label>
          <button className="button" disabled={busy}>
            Record privacy decision
          </button>
        </form>
      ) : null}
      <button
        className="text-button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void refresh()
            .catch((e) => setNotice(e instanceof Error ? e.message : "Refresh unavailable."))
            .finally(() => setBusy(false));
        }}
      >
        Refresh execution status
      </button>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      <h2>Private review and retention history</h2>
      <ul>
        {data.events.map((e, i) => (
          <li key={i}>
            {e.kind}: {e.reason}
            <p>Owner explanation: {e.public_reason || "None"}</p>
          </li>
        ))}
      </ul>
      {data.holds.length ? (
        <>
          <h2>Retention holds</h2>
          <ul>
            {data.holds.map((h, i) => (
              <li key={i}>
                {h.released_at ? "Released" : "Active"}: {h.reason}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
