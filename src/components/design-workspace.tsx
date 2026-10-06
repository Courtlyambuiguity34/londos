"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ShopSpecification } from "@/modules/shop-design/specification";

type State = {
  version: number;
  revision: number | null;
  publishedRevision: number | null;
  specification: ShopSpecification;
  history: { revision: number; summary: string }[];
  departments: { id: string; name: string }[];
};
export function DesignWorkspace({ shopId }: { shopId: string }) {
  const root = `/api/workspace/shops/${shopId}/design`,
    [state, setState] = useState<State | null>(null),
    [spec, setSpec] = useState<ShopSpecification | null>(null),
    [summary, setSummary] = useState("Arrange my shop"),
    [status, setStatus] = useState("Loading design…"),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [moving, setMoving] = useState(""),
    [before, setBefore] = useState(""),
    [rollback, setRollback] = useState("");
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(root, { cache: "no-store", signal: signal ?? null });
      if (!response.ok) throw Error("This design is unavailable to your account.");
      const current = (await response.json()) as State;
      setState(current);
      setSpec(current.specification);
      setConfirmed(false);
    },
    [root],
  );
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve()
      .then(() => refresh(controller.signal))
      .then(() => setStatus("Design loaded."))
      .catch((error) => {
        if (!controller.signal.aborted)
          setStatus(error instanceof Error ? error.message : "Design could not load.");
      });
    return () => controller.abort();
  }, [refresh]);
  async function command(path: string, body: unknown, method = "POST") {
    setBusy(true);
    setStatus(
      path === "/publish"
        ? "Publishing shop…"
        : path === "/unpublish"
          ? "Unpublishing shop…"
          : "Saving draft…",
    );
    try {
      const response = await fetch(`${root}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw Error(
          response.status === 409
            ? "The design or shop state changed. Reload before trying again."
            : response.status === 403
              ? "Sign in again or verify account security before publishing."
              : response.status === 404
                ? "This design or a referenced item is unavailable to your account."
                : "This change could not be saved. Check the design and try again.",
        );
      await refresh();
      setStatus(
        path === "/publish"
          ? "Shop published."
          : path === "/unpublish"
            ? "Shop unpublished."
            : "Draft saved. Preview before publishing.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The change could not complete.");
    } finally {
      setBusy(false);
    }
  }
  if (!state || !spec) return <p role="status">{status}</p>;
  const spaceName = (id: string) => {
    const space = spec.spaces.find((s) => s.id === id);
    return space?.type === "department"
      ? (state.departments.find((d) => d.id === space.departmentId)?.name ?? id)
      : space?.type === "story" || space?.type === "products"
        ? space.title
        : id;
  };
  return (
    <div className="catalogue-workspace design-workspace">
      <p role="status" aria-live="polite">
        {status}
      </p>
      <p>
        Published revision: {state.publishedRevision ?? "None"}. Draft revision:{" "}
        {state.revision ?? "None"}.
      </p>
      <Link href="/security">Verify account security</Link>
      <Link prefetch={false} href={`/shopkeeper/shops/${shopId}/design/assistant`}>
        Describe a change with the design assistant
      </Link>
      <Link href="/sign-in">Sign in again</Link>
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          void command("", { version: state.version, summary, specification: spec }, "PUT");
        }}
      >
        <h2>Shop design</h2>
        <p>
          Choose a template and arrange departments. Prices and contact details remain in your
          catalogue settings.
        </p>
        <label htmlFor="design-theme">Shop theme</label>
        <select
          id="design-theme"
          value={spec.theme}
          onChange={(e) =>
            setSpec({ ...spec, theme: e.target.value as ShopSpecification["theme"] })
          }
        >
          <option value="earth">Earth boutique</option>
          <option value="plum">Plum boutique</option>
          <option value="blue">Blue studio</option>
        </select>
        <label>
          Shop announcement
          <input
            maxLength={160}
            value={spec.announcement}
            onChange={(e) => setSpec({ ...spec, announcement: e.target.value })}
          />
        </label>
        <fieldset>
          <legend>Contact actions</legend>
          {(["call", "whatsapp", "enquiry"] as const).map((action) => (
            <label key={action} className="check-label">
              <input
                type="checkbox"
                checked={spec.actions.includes(action)}
                onChange={(e) =>
                  setSpec({
                    ...spec,
                    actions: e.target.checked
                      ? [...spec.actions, action]
                      : spec.actions.filter((a) => a !== action),
                  })
                }
              />
              {action === "call"
                ? "Show Call"
                : action === "whatsapp"
                  ? "Show WhatsApp"
                  : "Show enquiries"}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Departments in the shop entrance (up to four)</legend>
          {state.departments.map((department) => {
            const selected = spec.spaces.some(
              (space) => space.type === "department" && space.departmentId === department.id,
            );
            return (
              <label key={department.id} className="check-label">
                <input
                  type="checkbox"
                  aria-label={`Show ${department.name} department`}
                  checked={selected}
                  disabled={
                    !selected && spec.spaces.filter((s) => s.type === "department").length >= 4
                  }
                  onChange={(e) =>
                    setSpec({
                      ...spec,
                      spaces: e.target.checked
                        ? [
                            ...spec.spaces,
                            {
                              id: `s-${department.id}`,
                              type: "department",
                              version: 1,
                              departmentId: department.id,
                              limit: 8,
                            },
                          ]
                        : spec.spaces.filter(
                            (space) =>
                              space.type !== "department" || space.departmentId !== department.id,
                          ),
                    })
                  }
                />
                {department.name}
              </label>
            );
          })}
        </fieldset>
        <ol>
          {spec.spaces.map((space) => (
            <li key={space.id}>{spaceName(space.id)}</li>
          ))}
        </ol>
        <button
          type="button"
          className="text-button"
          onClick={() =>
            setSpec({
              ...spec,
              spaces: state.departments.slice(0, 4).map((department, i) => ({
                id: `department-${i}`,
                type: "department",
                version: 1,
                departmentId: department.id,
                limit: 8,
              })),
            })
          }
        >
          Use department template
        </button>
        <label>
          Change summary
          <input
            required
            maxLength={500}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
        <button className="button" disabled={busy}>
          Save draft
        </button>
      </form>
      {state.revision ? (
        <>
          <h2>Arrange the saved draft</h2>
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              void command("/patch", {
                version: state.version,
                patch: { op: "move", spaceId: moving, before },
              });
            }}
          >
            <label htmlFor="move-section">Move section</label>
            <select
              id="move-section"
              required
              value={moving}
              onChange={(e) => setMoving(e.target.value)}
            >
              <option value="">Choose a section</option>
              {spec.spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {spaceName(s.id)}
                </option>
              ))}
            </select>
            <label htmlFor="before-section">Before section</label>
            <select
              id="before-section"
              required
              value={before}
              onChange={(e) => setBefore(e.target.value)}
            >
              <option value="">Choose a section</option>
              {spec.spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {spaceName(s.id)}
                </option>
              ))}
            </select>
            <button className="button" disabled={busy || moving === before}>
              Move section in draft
            </button>
          </form>
          {busy ? (
            <button className="button button--outline" disabled>
              Preview saved draft
            </button>
          ) : (
            <Link
              className="button button--outline"
              href={`/shopkeeper/shops/${shopId}/preview?revision=${state.revision}`}
              prefetch={false}
            >
              Preview saved draft
            </Link>
          )}
          <h2>Publish</h2>
          <p>
            Publishing makes the shop's approved catalogue and contact details visible. Preview the
            saved revision first.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed this saved draft and confirm publication
          </label>
          <button
            className="button"
            disabled={busy || !confirmed}
            onClick={() =>
              void command("/publish", {
                version: state.version,
                revision: state.revision,
                confirm: true,
              })
            }
          >
            Publish reviewed draft
          </button>
          <button
            className="button button--outline"
            disabled={busy || !confirmed}
            onClick={() => void command("/unpublish", { version: state.version, confirm: true })}
          >
            Unpublish shop
          </button>
          <h2>Restore a layout</h2>
          <p>
            Restoring creates a new draft. Current prices, availability and contact settings are
            kept.
          </p>
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              void command("/rollback", {
                version: state.version,
                revision: Number(rollback),
                summary: `Restore layout revision ${rollback}`,
              });
            }}
          >
            <label htmlFor="layout-revision">Layout revision</label>
            <select
              id="layout-revision"
              required
              value={rollback}
              onChange={(e) => setRollback(e.target.value)}
            >
              <option value="">Choose a revision</option>
              {state.history.map((item) => (
                <option key={item.revision} value={item.revision}>
                  Revision {item.revision} · {item.summary}
                </option>
              ))}
            </select>
            <button className="button" disabled={busy}>
              Restore as new draft
            </button>
          </form>
        </>
      ) : null}
      <button
        className="text-button"
        disabled={busy}
        onClick={() =>
          void refresh()
            .then(() => setStatus("Current design loaded."))
            .catch(() => setStatus("The design could not reload."))
        }
      >
        Reload current design
      </button>
    </div>
  );
}
