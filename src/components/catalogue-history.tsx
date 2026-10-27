"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  CatalogueHistoryItem,
  CatalogueHistoryPage,
  CatalogueSnapshot,
} from "@/modules/catalogue-history";
import { formatMinorMoney } from "@/modules/money";

const labels: Record<string, string> = {
  name: "Name",
  slug: "Link",
  position: "Display order",
  archived: "Hidden from customers",
  departmentId: "Department",
  kind: "Item type",
  description: "Description",
  currency: "Currency",
  priceMinor: "Price",
  availability: "Availability",
  mediaId: "Photo",
};
const date = (value: string) =>
  new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
function value(snapshot: CatalogueSnapshot, key: string) {
  const data = snapshot.data,
    item = data[key];
  if (key === "priceMinor") return formatMinorMoney(item as string | null, String(data.currency));
  if (key === "departmentId") return "Department selection changed";
  if (key === "mediaId") return item ? "Photo selected" : "No photo";
  if (key === "position") return Number(item) + 1;
  if (typeof item === "boolean") return item ? "Yes" : "No";
  if (item === null || item === "") return "Not set";
  if (key === "availability")
    return (
      { available: "Available", unavailable: "Unavailable", archived: "Hidden" } as Record<
        string,
        string
      >
    )[String(item)];
  return String(item);
}
function Differences({ entry }: { entry: CatalogueHistoryItem }) {
  const before = entry.before_state;
  if (!before)
    return (
      <p>This item was created. Delete it from Products or Departments if you no longer need it.</p>
    );
  const keys = Object.keys(labels).filter(
    (key) => JSON.stringify(before.data[key]) !== JSON.stringify(entry.after_state.data[key]),
  );
  return (
    <>
      <dl className="catalogue-change-details">
        {keys.map((key) => (
          <div key={key}>
            <dt>{labels[key]}</dt>
            <dd>
              <span>Before: {value(before, key)}</span>
              <span>After: {value(entry.after_state, key)}</span>
            </dd>
          </div>
        ))}
      </dl>
      {!keys.length ? <p>The item’s deletion or recovery status changed.</p> : null}
    </>
  );
}
export function CatalogueHistory({
  shopId,
  onChanged,
}: {
  shopId: string;
  onChanged: () => Promise<void>;
}) {
  const root = `/api/workspace/shops/${shopId}/catalogue/history`,
    [state, setState] = useState<CatalogueHistoryPage | null>(null),
    [offset, setOffset] = useState(0),
    [deletedOffset, setDeletedOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(`${root}?offset=${offset}&deletedOffset=${deletedOffset}`, {
        cache: "no-store",
        signal: signal ?? null,
      });
      if (!response.ok)
        throw new Error("History could not load. Check your access or sign in again.");
      const data = await response.json();
      signal?.throwIfAborted();
      setState(data);
    },
    [root, offset, deletedOffset],
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
  async function command(data: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    let confirmed = false;
    try {
      const response = await fetch(root, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, confirm: true }),
      });
      if (!response.ok) {
        const result = await response.json();
        const messages: Record<string, string> = {
          department_name_in_use:
            "That department name is already in use. Rename the other department before restoring this version.",
          slug_in_use:
            "That link is already in use. Change the other item's address before restoring.",
          restore_department_first: "Restore and activate the product's department first.",
          recovery_expired: "The 30-day recovery period has ended. This item cannot be restored.",
          recovery_unavailable:
            "This recovery version is expired or unavailable. Reload the history.",
          restore_from_bin_first:
            "This item is deleted. Restore it from Deleted items before reverting an edit.",
          stale_version: "The item changed in another session. Reload history before trying again.",
          recovery_image_unavailable:
            "A photo needed for recovery is no longer available. No changes were made.",
          department_limit:
            "There is no room for another department. Remove an unused department before restoring.",
          product_limit:
            "There is no room for these products. Remove unused products before restoring.",
        };
        throw new Error(
          messages[result.error] ??
            "The change could not complete. Check your access and reload history.",
        );
      }
      confirmed = true;
      await onChanged();
      await refresh();
      setMessage(
        data.action === "restore"
          ? "Restored. Your catalogue is up to date."
          : "Previous values restored as a new change. Your history is kept.",
      );
    } catch (error) {
      setMessage(
        `${confirmed ? "The change was saved, but the latest view could not reload. " : ""}${error instanceof Error ? error.message : "Reload before trying again."}`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="catalogue-history">
      <h2>History & deleted items</h2>
      <p>
        Recover deleted items and revert edits for 30 days. A restore or revert creates a new
        change; it does not erase your history. Changes can become visible immediately in a
        published shop.
      </p>
      <p className="catalogue-history-message" role="status" aria-live="polite">
        {message || (!state ? "Loading history…" : "")}
      </p>
      <button
        className="text-button"
        type="button"
        disabled={busy}
        onClick={() => void refresh().catch((error) => setMessage(error.message))}
      >
        Reload history
      </button>
      <section aria-label="Deleted items">
        <h3>Deleted items</h3>
        <p>
          Deleting a department also moves its products here. Restore the department to recover its
          batch of products together. Items deleted earlier on their own stay deleted.
        </p>
        {state && !state.deleted.length ? <p>No recoverable deleted items on this page.</p> : null}
        <ul className="workspace-list">
          {state?.deleted.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <div>
                <strong>{item.name}</strong>
                <p>
                  {item.kind === "department" ? "Department" : "Product or service"} · Restore
                  before {date(item.recover_until)}
                </p>
              </div>
              <button
                type="button"
                className="button button--outline"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Restore ${item.name}${item.kind === "department" ? " and the products deleted with it" : ""}? It may reappear in your published shop.`,
                    )
                  )
                    void command({
                      action: "restore",
                      kind: item.kind,
                      id: item.id,
                      version: item.version,
                    });
                }}
              >
                Restore {item.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="account-links">
          <button
            type="button"
            className="text-button"
            disabled={busy || !deletedOffset}
            onClick={() => setDeletedOffset(Math.max(0, deletedOffset - 20))}
          >
            Previous deleted items
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy || !state?.hasMoreDeleted}
            onClick={() => setDeletedOffset(deletedOffset + 20)}
          >
            More deleted items
          </button>
        </div>
      </section>
      <section aria-label="Recent catalogue changes">
        <h3>Recent changes</h3>
        <p>
          History starts when this feature is deployed. Versions expire after 30 days; customer
          requests and financial records have their own retention rules.
        </p>
        {state && !state.history.length ? <p>No recent changes on this page.</p> : null}
        <div className="catalogue-history-list">
          {state?.history.map((entry) => (
            <details key={entry.id} className="catalogue-history-entry">
              <summary>
                <strong>{entry.after_state.data.name}</strong>
                <span>
                  {
                    (
                      {
                        created: "Created",
                        updated: "Edited",
                        deleted: "Deleted",
                        restored: "Restored",
                        reverted: "Reverted",
                        renamed: "Name made unique",
                      } as Record<string, string>
                    )[entry.action]
                  }{" "}
                  · {date(entry.created_at)}
                </span>
              </summary>
              <p>
                {entry.actor_name ?? "Londos system"} · Available until {date(entry.expires_at)}
              </p>
              <Differences entry={entry} />
              {entry.before_state &&
              !entry.before_state.deletedAt &&
              !entry.deleted &&
              ["updated", "reverted", "renamed"].includes(entry.action) ? (
                <button
                  className="button button--outline"
                  type="button"
                  disabled={busy || !entry.current_version}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Restore the values from before this change to ${entry.after_state.data.name}? This replaces its current details and creates a new history entry.`,
                      )
                    )
                      void command({
                        action: "revert",
                        historyId: entry.id,
                        version: entry.current_version,
                      });
                  }}
                >
                  Revert this change
                </button>
              ) : null}
            </details>
          ))}
        </div>
        <div className="account-links">
          <button
            type="button"
            className="text-button"
            disabled={busy || !offset}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            Previous changes
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy || !state?.hasMore}
            onClick={() => setOffset(offset + 20)}
          >
            More changes
          </button>
        </div>
      </section>
    </div>
  );
}
