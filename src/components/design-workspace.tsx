"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  shopSpecification,
  type ShopSpecification,
  type ShopPresentation,
} from "@/modules/shop-design/specification";
import { DesignSections } from "./design-sections";

type State = {
  version: number;
  revision: number | null;
  publishedRevision: number | null;
  specification: ShopSpecification;
  history: { revision: number; summary: string }[];
  departments: { id: string; name: string }[];
  products: { id: string; name: string; has_image: boolean }[];
};
const defaultPresentation: ShopPresentation = {
  premiseStyle: "minimalist",
  palette: {
    primary: "charcoal",
    secondary: "stone",
    background: "white",
    surface: "cream",
    text: "charcoal",
    accent: "burgundy",
  },
  typography: "modern",
  density: "balanced",
  contentWidth: "standard",
  navigation: { desktop: "department_bar", mobile: "compact" },
  productColumns: { mobile: 2, desktop: 3 },
};

const colorTokens = [
  "cream",
  "burgundy",
  "gold",
  "charcoal",
  "white",
  "black",
  "stone",
  "sand",
  "terracotta",
  "sage",
  "forest",
  "navy",
  "sky",
  "plum",
] as const;

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
      : space && "title" in space
        ? typeof space.title === "string"
          ? space.title
          : space.title.text
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
          if (!shopSpecification.safeParse(spec).success) {
            setStatus(
              "Check section text, unique references and the eight-section/32-card page budget before saving.",
            );
            return;
          }
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
          <legend>Responsive premises</legend>
          <p>
            These controls are deterministic and provider-free. They use only Londos-approved
            layout, palette and responsive tokens.
          </p>
          {!spec.presentation ? (
            <button
              type="button"
              className="button button--outline"
              onClick={() => setSpec({ ...spec, presentation: defaultPresentation })}
            >
              Enable responsive premise controls
            </button>
          ) : (
            <>
              <label>
                Premise style
                <select
                  value={spec.presentation.premiseStyle}
                  onChange={(e) =>
                    setSpec({
                      ...spec,
                      presentation: {
                        ...spec.presentation!,
                        premiseStyle: e.target.value as ShopPresentation["premiseStyle"],
                      },
                    })
                  }
                >
                  {[
                    "luxury",
                    "streetwear",
                    "electronics",
                    "food",
                    "service",
                    "minimalist",
                    "editorial",
                    "catalogue",
                  ].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Density
                <select
                  value={spec.presentation.density}
                  onChange={(e) =>
                    setSpec({
                      ...spec,
                      presentation: {
                        ...spec.presentation!,
                        density: e.target.value as ShopPresentation["density"],
                      },
                    })
                  }
                >
                  <option value="airy">Airy</option>
                  <option value="balanced">Balanced</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
              <label>
                Content width
                <select
                  value={spec.presentation.contentWidth}
                  onChange={(e) =>
                    setSpec({
                      ...spec,
                      presentation: {
                        ...spec.presentation!,
                        contentWidth: e.target.value as ShopPresentation["contentWidth"],
                      },
                    })
                  }
                >
                  <option value="narrow">Narrow</option>
                  <option value="standard">Standard</option>
                  <option value="wide">Wide</option>
                </select>
              </label>
              <label>
                Typography
                <select
                  value={spec.presentation.typography}
                  onChange={(e) =>
                    setSpec({
                      ...spec,
                      presentation: {
                        ...spec.presentation!,
                        typography: e.target.value as ShopPresentation["typography"],
                      },
                    })
                  }
                >
                  {["editorial", "modern", "classic", "technical", "friendly"].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              {(["primary", "secondary", "background", "surface", "text", "accent"] as const).map(
                (role) => (
                  <label key={role}>
                    {role} colour
                    <select
                      value={spec.presentation!.palette[role]}
                      onChange={(e) =>
                        setSpec({
                          ...spec,
                          presentation: {
                            ...spec.presentation!,
                            palette: {
                              ...spec.presentation!.palette,
                              [role]: e.target.value as (typeof colorTokens)[number],
                            },
                          },
                        })
                      }
                    >
                      {colorTokens.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                ),
              )}
              <label>
                Desktop navigation
                <select
                  value={spec.presentation.navigation.desktop}
                  onChange={(e) =>
                    setSpec({
                      ...spec,
                      presentation: {
                        ...spec.presentation!,
                        navigation: {
                          ...spec.presentation!.navigation,
                          desktop: e.target.value as ShopPresentation["navigation"]["desktop"],
                        },
                      },
                    })
                  }
                >
                  <option value="minimal">Minimal</option>
                  <option value="department_bar">Department bar</option>
                  <option value="editorial">Editorial</option>
                </select>
              </label>
              <label>
                Mobile navigation
                <select
                  value={spec.presentation.navigation.mobile}
                  onChange={(e) =>
                    setSpec({
                      ...spec,
                      presentation: {
                        ...spec.presentation!,
                        navigation: {
                          ...spec.presentation!.navigation,
                          mobile: e.target.value as ShopPresentation["navigation"]["mobile"],
                        },
                      },
                    })
                  }
                >
                  <option value="compact">Compact</option>
                  <option value="bottom">Bottom navigation</option>
                  <option value="department_bar">Department bar</option>
                </select>
              </label>
              <label>
                Mobile product columns
                <select
                  value={spec.presentation.productColumns.mobile}
                  onChange={(e) =>
                    setSpec({
                      ...spec,
                      presentation: {
                        ...spec.presentation!,
                        productColumns: {
                          ...spec.presentation!.productColumns,
                          mobile: Number(e.target.value) as 1 | 2,
                        },
                      },
                    })
                  }
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </label>
              <label>
                Desktop product columns
                <select
                  value={spec.presentation.productColumns.desktop}
                  onChange={(e) =>
                    setSpec({
                      ...spec,
                      presentation: {
                        ...spec.presentation!,
                        productColumns: {
                          ...spec.presentation!.productColumns,
                          desktop: Number(e.target.value) as 2 | 3 | 4,
                        },
                      },
                    })
                  }
                >
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </label>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  const { presentation: _presentation, ...legacy } = spec;
                  setSpec(legacy as ShopSpecification);
                }}
              >
                Use classic premise styling
              </button>
            </>
          )}
        </fieldset>
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
                    !selected &&
                    (spec.spaces.length >= 8 ||
                      spec.spaces.filter((s) => s.type === "department").length >= 4)
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
        <DesignSections
          specification={spec}
          departments={state.departments}
          products={state.products}
          onChange={setSpec}
        />
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
          Replace layout with department template
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
