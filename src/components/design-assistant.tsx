"use client";

import { designAssistantStatusMessage } from "@/modules/design-assistant-status";
import { designResponseError, DesignResponseError } from "@/modules/design-feedback";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import type { assistantStatus, readAssistantRequest } from "@/server/ai-design/service";
import { DesignProposalPreview } from "./design-proposal-preview";
import { shopThemes } from "@/modules/shop-themes/catalogue";
type State = Awaited<ReturnType<typeof assistantStatus>>;
type Proposal = Awaited<ReturnType<typeof readAssistantRequest>>;
const explain = (p: Proposal) =>
  p.status === "proposed"
    ? p.decisions.some((decision) => decision.blocking)
      ? "One detail is needed before a design can be prepared. Choose a direction below or describe it in your next request."
      : "A validated proposal is ready. Preview it before applying."
    : p.status === "applied"
      ? "Applied as a new draft. Publication still requires your separate review and confirmation."
      : p.status === "running"
        ? designAssistantStatusMessage("thinking")
        : p.status === "cancelled"
          ? "Proposal cancelled. Your saved design is unchanged."
          : p.status === "rejected"
            ? "Proposal rejected. Your saved design is unchanged."
            : p.status === "expired"
              ? "Proposal expired. Request a new proposal against the current design."
              : p.status === "rate_limited"
                ? "Provider quota or cooldown reached. Try later; local design directions and manual editing remain available."
                : p.failureCode === "provider_authentication"
                  ? "The design provider could not authorise this request. Ask mall management to check its API key. Local directions and themes remain available."
                  : p.failureCode === "provider_timeout"
                    ? "The design provider took too long to respond. No draft changed. Try a local direction or request again later."
                    : p.failureCode === "external_consent_required"
                      ? "This instruction needs a configured provider and your permission to send shop design data. Try a supported simple edit or use manual design."
                      : p.status === "unavailable"
                        ? "Conversational provider is unavailable. Supported simple edits and manual design remain available."
                        : p.status === "conflict"
                          ? "The shop or your authority changed. Reload and review before requesting again."
                          : "The provider response could not pass validation. No draft was changed. Try a clearer brief or a local design direction.";
function reviewMessage(status: string) {
  return (
    (
      {
        review_authentication:
          "The independent review provider could not authenticate. Your original proposal passed Londos validation; an independent review was not completed.",
        review_timeout:
          "The independent review took too long. Your original validated proposal is retained.",
        review_unavailable:
          "An independent review is unavailable. Your original validated proposal is retained.",
        review_rate_limited:
          "The review provider reached its quota. Your original validated proposal is retained.",
        review_changed_or_low_confidence:
          "The review changed the proposal or flagged uncertainty. Check the preview carefully.",
        initial_fallback_requires_review:
          "A fallback provider prepared this proposal. Review it carefully before applying.",
      } as Record<string, string>
    )[status] ??
    "The independent review needs your attention. Check the preview before accepting this candidate."
  );
}
export function DesignAssistant({ shopId, initial }: { shopId: string; initial: State }) {
  const root = `/api/workspace/shops/${shopId}/design/assistant`,
    [state, setState] = useState(initial),
    [proposal, setProposal] = useState<Proposal | null>(initial.recent[0] ?? null),
    [instruction, setInstruction] = useState(""),
    [consent, setConsent] = useState(false),
    [quality, setQuality] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [warning, setWarning] = useState(false),
    [proposing, setProposing] = useState(false),
    [deciding, setDeciding] = useState(false),
    [recovering, setRecovering] = useState(false),
    [pollHalted, setPollHalted] = useState(false),
    [notice, setNotice] = useState(
      initial.recent[0] ? explain(initial.recent[0]) : designAssistantStatusMessage("idle"),
    );
  const retry = useRef<{
      signature: string;
      body: {
        key: string;
        version: number;
        instruction: string;
        externalConsent: boolean;
        qualityReview: boolean;
      };
    } | null>(null),
    selected = useRef<Proposal | null>(initial.recent[0] ?? null),
    post = useRef<AbortController | null>(null),
    instructionField = useRef<HTMLTextAreaElement>(null);
  const busy = proposing || deciding,
    running = proposal?.status === "running";
  const accept = useCallback((value: Proposal) => {
    const previous = selected.current;
    if (previous?.id === value.id && previous.version > value.version) return;
    selected.current = value;
    setProposal(value);
    if (previous?.id !== value.id || previous.version !== value.version) {
      setConfirmed(false);
      setWarning(false);
    }
  }, []);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const r = await fetch(root, {
        cache: "no-store",
        signal: AbortSignal.any([
          signal ?? new AbortController().signal,
          AbortSignal.timeout(12000),
        ]),
      });
      if (!r.ok) throw await designResponseError(r);
      const s = (await r.json()) as State;
      setState(s);
      return s;
    },
    [root],
  );
  useEffect(() => {
    if (pollHalted || (!proposing && !running && !recovering)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>,
      misses = 0;
    const poll = async () => {
      try {
        const s = await refresh(controller.signal);
        if (controller.signal.aborted) return;
        const current = retry.current
          ? s.recent.find((item) => item.requestKey === retry.current!.body.key)
          : s.recent.find((item) => item.id === selected.current?.id);
        if (current) {
          accept(current);
          if (current.status !== "running") {
            setNotice(explain(current));
            retry.current = null;
            setRecovering(false);
          }
        } else if (recovering && ++misses >= 3) {
          setRecovering(false);
          setNotice(
            "This submission could not be confirmed. Retry the unchanged brief to reuse its original request key, or reload to inspect the latest status.",
          );
        }
      } catch (error) {
        if (error instanceof DesignResponseError && [401, 403, 404].includes(error.status)) {
          setPollHalted(true);
          setRecovering(false);
          setNotice(error.message);
          controller.abort();
          return;
        }
        if (!controller.signal.aborted)
          setNotice(
            "The latest progress could not load. Your saved design is unchanged; Londos will keep checking this request.",
          );
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, document.hidden ? 6000 : 2500);
    };
    timer = setTimeout(poll, 1000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [proposing, running, recovering, pollHalted, refresh, accept]);
  useEffect(() => () => post.current?.abort(), []);
  async function propose() {
    if (busy || running) return;
    if (instruction.trim().length < 2) {
      setNotice("Describe the change using at least two non-space characters.");
      return;
    }
    setPollHalted(false);
    setProposing(true);
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
    let uncertain = true;
    const submitted = retry.current.body;
    post.current = new AbortController();
    try {
      const r = await fetch(root, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(submitted),
        signal: AbortSignal.any([post.current.signal, AbortSignal.timeout(45000)]),
      });
      if (!r.ok) {
        uncertain = r.status >= 500 || r.status === 408;
        throw await designResponseError(r);
      }
      const p = (await r.json()) as Proposal;
      accept(p);
      setNotice(explain(selected.current ?? p));
      retry.current = null;
      setRecovering(false);
      await refresh().catch(() =>
        setNotice(
          `${explain(p)} The latest status could not refresh. Reload the assistant before another request.`,
        ),
      );
    } catch (e) {
      const known = selected.current;
      if (known?.requestKey === submitted.key && known.status !== "running") {
        setNotice(explain(known));
        retry.current = null;
      } else {
        setNotice(
          e instanceof Error
            ? e.message
            : "Request failed. Retrying an unchanged request retains its original key.",
        );
        setRecovering(uncertain);
        if (!uncertain) retry.current = null;
      }
    } finally {
      setProposing(false);
    }
  }
  async function decide(action: "apply" | "reject" | "cancel") {
    const current = selected.current;
    if (!current || deciding) return;
    setDeciding(true);
    try {
      const r = await fetch(`${root}/${current.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          version: current.version,
          confirm: true,
          acceptReviewWarning: warning,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw await designResponseError(r);
      const p = (await r.json()) as Proposal;
      accept(p);
      setNotice(explain(p));
      setConfirmed(false);
      retry.current = null;
      setRecovering(false);
      if (action === "cancel") post.current?.abort();
      await refresh().catch(() =>
        setNotice(
          `${explain(p)} The latest status could not refresh. Reload the assistant before another request.`,
        ),
      );
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "This decision could not complete. Reload to inspect its result.",
      );
    } finally {
      setDeciding(false);
    }
  }
  const choose = (value: string) => {
    setInstruction(value);
    instructionField.current?.focus();
    instructionField.current?.scrollIntoView({ block: "center" });
  };
  const actionable =
      proposal?.status === "proposed" && !proposal.decisions.some((decision) => decision.blocking),
    proposalHref = proposal
      ? `/shopkeeper/shops/${shopId}/design/assistant/${proposal.id}/preview`
      : "",
    draftHref = state.draftRevision
      ? `/shopkeeper/shops/${shopId}/preview?revision=${state.draftRevision}`
      : undefined;
  return (
    <div className="assistant-studio">
      <p role="status" aria-live="polite" className="assistant-notice">
        {notice}
      </p>
      <div className="assistant-studio-intro">
        <p className="workspace-eyebrow">Your storefront, thoughtfully designed</p>
        <h2>From an idea to a shop you love.</h2>
        <p>
          Describe the look, see a private preview, then choose what to save. Your live storefront
          stays under your control.
        </p>
      </div>
      <div className="assistant-studio-grid">
        <div className="assistant-brief-panel">
          <section aria-label="Design starting points" className="assistant-starting-points">
            <h3>Start with a direction</h3>
            <div>
              {[
                "Create a nature-inspired storefront",
                "Create a modern storefront",
                "Create a premium dark storefront",
                "Use Mosaic theme",
              ].map((label) => (
                <button
                  type="button"
                  key={label}
                  disabled={busy || running}
                  onClick={() => choose(label)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p>These directions and named themes work locally, with your own catalogue.</p>
          </section>
          <form
            className="account-form"
            onSubmit={(event) => {
              event.preventDefault();
              void propose();
            }}
          >
            <label htmlFor="ai-instruction">Describe your design change</label>
            <textarea
              id="ai-instruction"
              ref={instructionField}
              required
              minLength={2}
              maxLength={2000}
              rows={5}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              disabled={busy || running}
              placeholder="For example: create a nature-inspired storefront with a welcoming hero and clear product collections."
              aria-describedby="assistant-brief-help"
            />
            <p id="assistant-brief-help" className="assistant-help">
              Tell us the colours, mood and sections you want. Reference websites are not opened or
              imported; describe what you like about them. Do not include private customer data or
              passwords.
            </p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                disabled={busy || running}
              />
              I allow configured design providers to process this instruction and minimal shop
              design/catalogue labels for this request.
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={quality}
                onChange={(event) => setQuality(event.target.checked)}
                disabled={busy || running}
              />
              Request a selective quality review when external processing is needed.
            </label>
            <button className="button" disabled={busy || running}>
              {proposing ? "Preparing proposal…" : "Propose design change"}
            </button>
          </form>
          <details className="assistant-theme-shortcuts">
            <summary>Choose from {shopThemes.length} storefront themes</summary>
            <div>
              {shopThemes.map((theme) => (
                <button
                  type="button"
                  key={theme.id}
                  disabled={busy || running}
                  onClick={() => choose(`Use ${theme.name} theme`)}
                >
                  <strong>{theme.name}</strong>
                  <small>{theme.description}</small>
                </button>
              ))}
            </div>
          </details>
        </div>
        <div className="assistant-result-panel">
          {proposal ? (
            <section aria-label="Current proposal" className="assistant-proposal-card">
              <div className="assistant-proposal-heading">
                <h2>Current proposal</h2>
                <span className="portal-pill">{proposal.status.replaceAll("_", " ")}</span>
              </div>
              <p>
                Status: {proposal.status}.{" "}
                {proposal.path === "deterministic"
                  ? "Deterministic edit: no provider call."
                  : proposal.path
                    ? `Path: ${proposal.path}.`
                    : ""}
              </p>
              {running ? (
                <>
                  <p>
                    This request continues to be checked even if the original connection is
                    interrupted. You can cancel it here.
                  </p>
                  <button
                    type="button"
                    className="button button--outline"
                    disabled={deciding}
                    onClick={() => void decide("cancel")}
                  >
                    Cancel request
                  </button>
                </>
              ) : null}
              {proposal.status === "proposed" ? (
                <>
                  <ul className="assistant-change-list">
                    {proposal.changes.map((change, index) => (
                      <li key={index}>{change}</li>
                    ))}
                  </ul>
                  {proposal.decisions.length ? (
                    <section className="assistant-design-decisions" aria-label="Design decisions">
                      <h3>A little direction from you</h3>
                      {proposal.decisions.map((decision) => (
                        <div key={decision.code}>
                          <p>
                            <strong>{decision.question}</strong>
                          </p>
                          <div className="assistant-decision-options">
                            {decision.options.map((option) => (
                              <button
                                type="button"
                                className="button button--outline"
                                key={option}
                                disabled={busy}
                                onClick={() => choose(option)}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                          <p>Recommended: {decision.recommended}</p>
                          {decision.blocking ? (
                            <p>
                              Choose an answer or describe it in the brief, then propose again. Your
                              draft has not changed.
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </section>
                  ) : null}
                  {actionable ? (
                    <>
                      <Link prefetch={false} className="button button--outline" href={proposalHref}>
                        Preview proposal
                      </Link>
                      <p className="assistant-expiry">
                        Available until{" "}
                        {new Date(proposal.expiresAt).toLocaleString("en-UG", {
                          timeZone: "Africa/Kampala",
                        })}
                        . A changed catalogue or draft needs a fresh proposal.
                      </p>
                      {proposal.reviewWarning ? (
                        <div className="assistant-review-warning">
                          <p>{reviewMessage(proposal.reviewStatus)}</p>
                          <label className="check-label">
                            <input
                              type="checkbox"
                              checked={warning}
                              onChange={(event) => setWarning(event.target.checked)}
                            />
                            I reviewed the provider review warning and accept this candidate.
                          </label>
                        </div>
                      ) : null}
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={(event) => setConfirmed(event.target.checked)}
                        />
                        I previewed this proposal and confirm applying it as a draft.
                      </label>
                      <div className="button-row">
                        <button
                          type="button"
                          className="button"
                          disabled={busy || !confirmed || (proposal.reviewWarning && !warning)}
                          onClick={() => void decide("apply")}
                        >
                          Apply reviewed proposal as draft
                        </button>
                        <button
                          type="button"
                          className="button button--outline"
                          disabled={busy}
                          onClick={() => void decide("reject")}
                        >
                          Reject proposal
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button button--outline"
                      disabled={busy}
                      onClick={() => void decide("reject")}
                    >
                      Dismiss proposal
                    </button>
                  )}
                </>
              ) : null}
              {proposal.status === "applied" ? (
                <Link
                  prefetch={false}
                  className="button"
                  href={`/shopkeeper/shops/${shopId}/design#review`}
                >
                  Review your saved draft
                </Link>
              ) : null}
            </section>
          ) : (
            <div className="assistant-empty">
              <h2>A fresh perspective for your shop.</h2>
              <p>
                Your proposal will appear here, with a clear summary of the changes. Nothing is
                saved or published automatically.
              </p>
              <ol>
                <li>Describe your idea</li>
                <li>Preview the proposal</li>
                <li>Apply it as a draft</li>
              </ol>
            </div>
          )}
          {actionable ? (
            <DesignProposalPreview
              key={proposal!.id}
              proposalHref={proposalHref}
              {...(draftHref ? { draftHref } : {})}
            />
          ) : null}
        </div>
      </div>
      <div className="assistant-footer-links">
        <Link prefetch={false} href={`/shopkeeper/shops/${shopId}/design`}>
          Continue with manual design, saved preview and publication
        </Link>
        <Link href="/security">Verify account security</Link>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() =>
            void refresh()
              .then((s) => {
                if (s.recent[0]) accept(s.recent[0]);
                else {
                  selected.current = null;
                  setProposal(null);
                }
                setPollHalted(false);
                setNotice("Current design and proposal status reloaded.");
                setConfirmed(false);
              })
              .catch((e) => setNotice(e instanceof Error ? e.message : "Could not reload."))
          }
        >
          Reload design assistant
        </button>
      </div>
      <details className="assistant-technical-details">
        <summary>Provider availability and usage</summary>
        <p>
          Gemini: {state.capabilities.gemini.replaceAll("_", " ")}. OpenAI:{" "}
          {state.capabilities.openai.replaceAll("_", " ")}. A configured provider has not
          necessarily passed a live contract check.
        </p>
        <h3>Provider use today (UTC)</h3>
        <p>{state.usageLimit}</p>
        {state.usage.length ? (
          <ul>
            {state.usage.map((u) => (
              <li key={`${u.provider}-${u.verification}`}>
                {u.provider} · {u.verification.replaceAll("_", " ")} · {u.attempts} attempts ·{" "}
                {u.reported_input_tokens} reported input / {u.reported_output_tokens} reported
                output tokens · {u.unmeasured_attempts} unmeasured attempts ·{" "}
                {u.estimated_cost_microusd === null
                  ? "Cost estimate unavailable"
                  : `${u.estimated_cost_microusd} estimated USD micro-units`}
              </li>
            ))}
          </ul>
        ) : (
          <p>No provider calls recorded. Actual provider charges are unmeasured.</p>
        )}
        <p>
          Daily allowance: {state.limits.dailyRequests} requests per shop per UTC day; one active
          request per shop. Cancellation does not refund already admitted usage.
        </p>
      </details>
    </div>
  );
}
