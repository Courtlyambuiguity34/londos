"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import type { assistantStatus, readAssistantRequest } from "@/server/ai-design/service";
type State = Awaited<ReturnType<typeof assistantStatus>>;
type Proposal = Awaited<ReturnType<typeof readAssistantRequest>>;
const explain = (p: Proposal) =>
  p.status === "proposed"
    ? "A validated proposal is ready. Preview it before applying."
    : p.status === "applied"
      ? "Applied as a new draft. Publication still requires your separate review and confirmation."
      : p.status === "running"
        ? "Preparing a proposal…"
        : p.status === "cancelled"
          ? "Proposal cancelled. Already admitted provider usage is not refunded."
          : p.status === "rejected"
            ? "Proposal rejected. Your saved design is unchanged."
            : p.status === "expired"
              ? "Proposal expired. Request a new proposal against the current design."
              : p.status === "rate_limited"
                ? "Provider quota or cooldown reached. Wait before requesting again; manual design remains available."
                : p.failureCode === "external_consent_required"
                  ? "This instruction needs a configured provider and your permission to send shop design data. Try a supported simple edit or use manual design."
                  : p.status === "unavailable"
                    ? "Conversational provider is unavailable. Supported simple edits and manual design remain available."
                    : p.status === "conflict"
                      ? "The shop or your authority changed. Reload and review before requesting again."
                      : "The provider response could not pass validation. No draft was changed. Use manual design or request a new proposal.";
export function DesignAssistant({ shopId, initial }: { shopId: string; initial: State }) {
  const root = `/api/workspace/shops/${shopId}/design/assistant`,
    [state, setState] = useState(initial),
    [proposal, setProposal] = useState<Proposal | null>(initial.recent[0] ?? null),
    [instruction, setInstruction] = useState(""),
    [consent, setConsent] = useState(false),
    [quality, setQuality] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [warning, setWarning] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(
      "Describe a design change. Simple supported edits need no provider.",
    );
  const retry = useRef<{ signature: string; body: unknown } | null>(null);
  const refresh = useCallback(async () => {
    const r = await fetch(root, { cache: "no-store" });
    if (!r.ok) throw Error("Sign in again or verify account security to use this assistant.");
    const s = (await r.json()) as State;
    setState(s);
    return s;
  }, [root]);
  useEffect(() => {
    if (!busy) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void fetch(root, { cache: "no-store", signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) return;
          const s = (await r.json()) as State;
          if (controller.signal.aborted) return;
          setState(s);
          const running = s.recent.find((p) => p.status === "running");
          if (running) setProposal(running);
        })
        .catch(() => {});
    }, 1000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [busy, root]);
  async function propose() {
    setBusy(true);
    setConfirmed(false);
    setWarning(false);
    setNotice("Preparing a proposal…");
    const value = {
        version: state.baseVersion,
        instruction,
        externalConsent: consent,
        qualityReview: quality,
      },
      signature = JSON.stringify(value);
    if (retry.current?.signature !== signature)
      retry.current = { signature, body: { key: crypto.randomUUID(), ...value } };
    try {
      const r = await fetch(root, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(retry.current.body),
      });
      if (!r.ok)
        throw Error(
          r.status === 429
            ? "Shop request, token, estimated-cost or concurrency limit reached. Try later; manual design remains available."
            : r.status === 409
              ? "The base design changed or retry body conflicts. Reload before trying again."
              : r.status === 403
                ? "Verify account security before requesting a proposal."
                : "This request is unavailable or invalid. Your saved design is unchanged.",
        );
      const p = (await r.json()) as Proposal;
      setProposal(p);
      setNotice(explain(p));
      retry.current = null;
      await refresh();
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Request failed. Retrying an unchanged request retains its original key.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function decide(action: "apply" | "reject" | "cancel") {
    if (!proposal) return;
    setBusy(true);
    try {
      const r = await fetch(`${root}/${proposal.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          version: proposal.version,
          confirm: true,
          acceptReviewWarning: warning,
        }),
      });
      if (!r.ok)
        throw Error(
          r.status === 409
            ? "The proposal expired or its design/catalogue changed. Reload and request a new proposal."
            : r.status === 403
              ? "Verify account security before applying."
              : "The proposal is unavailable or needs review acknowledgment. No draft changed.",
        );
      const p = (await r.json()) as Proposal;
      setProposal(p);
      setNotice(explain(p));
      setConfirmed(false);
      await refresh();
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "This decision could not complete. Reload to inspect its result.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      <p>
        Request a proposal, preview it, then choose whether to apply it as a draft. The assistant
        never publishes.
      </p>
      <p>
        Try “Use plum theme”, “Remove the call button”, “Keep WhatsApp visible” or “Move Shoes
        before Handbags” when those departments are in the saved design.
      </p>
      <p>
        Gemini: {state.capabilities.gemini.replaceAll("_", " ")}. OpenAI:{" "}
        {state.capabilities.openai.replaceAll("_", " ")}. A configured provider has not necessarily
        passed a live contract check.
      </p>
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          void propose();
        }}
      >
        <label htmlFor="ai-instruction">Describe your design change</label>
        <textarea
          id="ai-instruction"
          required
          minLength={2}
          maxLength={2000}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={busy}
        />
        <p>
          Do not include passwords, customer details or private documents. Supported simple edits
          stay on Londos.
        </p>
        <label className="check-label">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={busy}
          />
          I allow configured design providers to process this instruction and minimal shop
          design/catalogue labels for this request.
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={quality}
            onChange={(e) => setQuality(e.target.checked)}
            disabled={busy}
          />
          Request a selective quality review when external processing is needed.
        </label>
        <button className="button" disabled={busy}>
          Propose design change
        </button>
      </form>
      {proposal ? (
        <section aria-label="Current proposal">
          <h2>Current proposal</h2>
          <p>
            Status: {proposal.status}.{" "}
            {proposal.path === "deterministic"
              ? "Deterministic edit: no provider call."
              : proposal.path
                ? `Path: ${proposal.path}.`
                : ""}
          </p>
          {proposal.status === "running" ? (
            <button className="button button--outline" onClick={() => void decide("cancel")}>
              Cancel request
            </button>
          ) : null}
          {proposal.status === "proposed" ? (
            <>
              <ul>
                {proposal.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              <Link
                prefetch={false}
                className="button button--outline"
                href={`/shopkeeper/shops/${shopId}/design/assistant/${proposal.id}/preview`}
              >
                Preview proposal
              </Link>
              <p>
                This proposal expires at {new Date(proposal.expiresAt).toLocaleString()}. Applying
                requires the unchanged current design and catalogue.
              </p>
              {proposal.reviewWarning ? (
                <>
                  <p>
                    Review needs attention: {proposal.reviewStatus.replaceAll("_", " ")}. Provider
                    recommendations are untrusted and cannot publish.
                  </p>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={warning}
                      onChange={(e) => setWarning(e.target.checked)}
                    />
                    I reviewed the provider review warning and accept this candidate.
                  </label>
                </>
              ) : null}
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I previewed this proposal and confirm applying it as a draft.
              </label>
              <button
                className="button"
                disabled={busy || !confirmed || (proposal.reviewWarning && !warning)}
                onClick={() => void decide("apply")}
              >
                Apply reviewed proposal as draft
              </button>
              <button
                className="button button--outline"
                disabled={busy}
                onClick={() => void decide("reject")}
              >
                Reject proposal
              </button>
            </>
          ) : null}
        </section>
      ) : null}
      <h2>Provider use today (UTC)</h2>
      <p>{state.usageLimit}</p>
      {state.usage.length ? (
        <ul>
          {state.usage.map(
            (u: {
              provider: string;
              verification: string;
              attempts: string;
              reported_input_tokens: string;
              reported_output_tokens: string;
              unmeasured_attempts: string;
              estimated_cost_microusd: string | null;
            }) => (
              <li key={`${u.provider}-${u.verification}`}>
                {u.provider} · {u.verification.replaceAll("_", " ")} · {u.attempts} attempts ·{" "}
                {u.reported_input_tokens} reported input / {u.reported_output_tokens} reported
                output tokens · {u.unmeasured_attempts} unmeasured attempts ·{" "}
                {u.estimated_cost_microusd === null
                  ? "Cost estimate unavailable"
                  : `${u.estimated_cost_microusd} estimated USD micro-units`}
              </li>
            ),
          )}
        </ul>
      ) : (
        <p>No provider calls recorded. Actual provider charges are unmeasured.</p>
      )}
      <p>
        Development limits: {state.limits.dailyRequests} requests per shop per UTC day; one active
        request per shop; bounded token and configured cost-estimate reservations. Cancellation does
        not refund already admitted usage.
      </p>
      <Link prefetch={false} href={`/shopkeeper/shops/${shopId}/design`}>
        Continue with manual design, saved preview and publication
      </Link>
      <Link href="/security">Verify account security</Link>
      <button
        className="text-button"
        disabled={busy}
        onClick={() =>
          void refresh()
            .then((s) => {
              setProposal(s.recent[0] ?? null);
              setNotice("Current design and proposal status reloaded.");
              setConfirmed(false);
            })
            .catch((e) => setNotice(e instanceof Error ? e.message : "Could not reload."))
        }
      >
        Reload design assistant
      </button>
    </>
  );
}
