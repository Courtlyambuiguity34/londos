"use client";
import { useState, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { readCostJournal } from "@/server/costs";
import { CostSummary } from "./cost-summary";
async function post(path: string, body: unknown) {
  const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    result = await r.json();
  if (!r.ok) throw Error(result.error ?? "Cost reporting unavailable; reload or sign in again.");
  return result;
}
export function CostClaim({ shop }: { shop: { id: string; shop_version: number } }) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const router = useRouter();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = new FormData(e.currentTarget);
    setBusy(true);
    setNotice("");
    void post(`/api/operator/costs/shops/${shop.id}/claim`, {
      shopVersion: shop.shop_version,
      reason: v.get("reason"),
      confirm: v.get("confirm") === "on",
    })
      .then(() => {
        router.push(`/landlord/costs/${shop.id}`);
        router.refresh();
      })
      .catch((e) => {
        setNotice(e instanceof Error ? e.message : "Scope unavailable.");
        setBusy(false);
      });
  }
  return (
    <form className="account-form" onSubmit={submit}>
      <label htmlFor={`cost-claim-${shop.id}`}>Cost scope reason</label>
      <input id={`cost-claim-${shop.id}`} name="reason" minLength={5} maxLength={500} required />
      <label className="checkbox-label">
        <input type="checkbox" name="confirm" required /> I accept this shop's reporting scope; this
        grants no financial or investigation decisions.
      </label>
      <button className="button" disabled={busy}>
        Claim cost reporting scope
      </button>
      <p role="status">{notice}</p>
    </form>
  );
}
export function CostJournal({ initial }: { initial: Awaited<ReturnType<typeof readCostJournal>> }) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const base = `/api/operator/costs/shops/${data.shop.id}`;
  async function refresh(after: string | null = null) {
    const response = await fetch(`${base}?days=${data.days}${after ? `&after=${after}` : ""}`),
      value = await response.json();
    if (!response.ok) throw Error(value.error ?? "Refresh unavailable.");
    setData(value);
  }
  async function act(body: Record<string, unknown>, form?: HTMLFormElement) {
    setBusy(true);
    setNotice("");
    const value = JSON.stringify(body);
    if (pending.current?.fingerprint !== value)
      pending.current = { fingerprint: value, key: crypto.randomUUID() };
    try {
      await post(base, { ...body, key: pending.current.key });
      await refresh();
      pending.current = null;
      form?.reset();
      setNotice(
        "Reported entry recorded. No rent credit, invoice, publication or privacy decision changed.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Entry unavailable.");
    } finally {
      setBusy(false);
    }
  }
  function record(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = new FormData(e.currentTarget);
    void act(
      {
        action: "record",
        version: data.version,
        category: v.get("category"),
        workDay: v.get("day"),
        minutes: Number(v.get("minutes")),
        expenseMinor: Number(v.get("expense")),
        currency: "UGX",
        reason: v.get("reason"),
        confirm: v.get("confirm") === "on",
      },
      e.currentTarget,
    );
  }
  return (
    <>
      <CostSummary {...data} />
      <h2>Record development operating work</h2>
      <p>
        Record only fictional operator-reported work and expenses. Use UTC dates. Do not include
        customer details, private evidence, passwords or provider credentials. These entries do not
        bill a merchant or credit rent.
      </p>
      <form className="account-form" onSubmit={record}>
        <label htmlFor="cost-category">Work category</label>
        <select id="cost-category" name="category">
          <option value="support">Support</option>
          <option value="verification">Verification</option>
          <option value="rent_collection">Rent collection</option>
        </select>
        <label htmlFor="cost-day">UTC work day</label>
        <input
          id="cost-day"
          name="day"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          required
        />
        <label htmlFor="cost-minutes">Reported minutes</label>
        <input
          id="cost-minutes"
          name="minutes"
          type="number"
          min="0"
          max="480"
          step="1"
          defaultValue="0"
          required
        />
        <label htmlFor="cost-expense">Reported UGX expense minor units</label>
        <input
          id="cost-expense"
          name="expense"
          type="number"
          min="0"
          max="1000000000"
          step="1"
          defaultValue="0"
          required
        />
        <label htmlFor="cost-reason">Private reporting reason</label>
        <textarea id="cost-reason" name="reason" minLength={5} maxLength={500} rows={3} required />
        <label className="checkbox-label">
          <input type="checkbox" name="confirm" required /> I confirm this fictional reported entry
          and its units; completeness is not verified.
        </label>
        <button className="button" disabled={busy}>
          Record reported work
        </button>
      </form>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void refresh()
            .catch((e) => setNotice(e.message))
            .finally(() => setBusy(false));
        }}
      >
        Refresh journal
      </button>
      <h2>Private journal page</h2>
      <p>
        At most 20 entries per record-ID page, across all work dates. Window summaries above use the
        original UTC work day and deduct later corrections. This is not a consistent full-account
        export.
      </p>
      {!data.entries.length ? (
        <p>No journal entries.</p>
      ) : (
        <ul className="team-list">
          {data.entries.map((e) => (
            <li key={e.id}>
              <strong>
                {e.category.replaceAll("_", " ")} · {e.work_day}
              </strong>
              <p>
                {e.minutes} reported minutes · UGX {e.expense_minor} expense minor units
                {e.reverses_id ? " · correction" : e.reversed ? " · reversed" : ""}
              </p>
              <p>{e.reason}</p>
              {!e.reverses_id && !e.reversed ? (
                <form
                  className="account-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const v = new FormData(event.currentTarget);
                    void act({
                      action: "reverse",
                      originalId: e.id,
                      version: data.version,
                      reason: v.get("reason"),
                      confirm: v.get("confirm") === "on",
                    });
                  }}
                >
                  <label htmlFor={`cost-correction-${e.id}`}>Correction reason</label>
                  <input
                    id={`cost-correction-${e.id}`}
                    name="reason"
                    required
                    minLength={5}
                    maxLength={500}
                  />
                  <label className="checkbox-label">
                    <input type="checkbox" name="confirm" required /> Append an exact reversal and
                    retain this original.
                  </label>
                  <button className="button button--outline" disabled={busy}>
                    Reverse reported entry
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {data.nextAfter ? (
        <button
          className="button button--outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void refresh(data.nextAfter)
              .catch((e) => setNotice(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Next journal page
        </button>
      ) : null}
    </>
  );
}
