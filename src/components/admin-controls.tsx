"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TeamView } from "@/server/team";
import type { OperationsView } from "@/server/administration";
const permissions = ["catalogue", "design", "publish", "finance", "sensitive"];
const labels: Record<string, string> = {
  catalogue: "Catalogue",
  design: "Design",
  publish: "Publication",
  finance: "Rent records",
  sensitive: "Contacts and sensitive settings",
};
async function command(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      (
        {
          stale_version: "This record changed. Reload before trying again.",
          fresh_authentication_required: "Sign in again or verify a fresh MFA code, then reload.",
          last_owner_required: "Keep at least one active owner.",
          address_unavailable: "That address is already reserved. Choose another.",
          mall_at_capacity: "That mall has reached its planning capacity. Choose another.",
          grant_exceeds_membership:
            "Shop permissions must also be enabled for this staff member’s merchant membership.",
          conflict_of_interest: "An operator cannot administer their own merchant account.",
          membership_already_exists:
            "This account already has a membership. Ask its owner to update access.",
          invitation_unavailable:
            "This invitation is unavailable, expired or belongs to another account.",
        } as Record<string, string>
      )[data.error] ??
        "The change could not be confirmed. Check your access and reload before retrying.",
    );
  return data;
}
function AccessLinks() {
  return (
    <p>
      <Link href="/security">Account security</Link> · <Link href="/sign-in">Sign in again</Link>
    </p>
  );
}
export function TeamPanel({ initial }: { initial: TeamView }) {
  const [team, setTeam] = useState(initial),
    [action, setAction] = useState("invite"),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const router = useRouter(),
    path = `/api/workspace/merchants/${team.merchant.id}/team`;
  async function reload() {
    const response = await fetch(`${path}?page=${team.page}`);
    if (!response.ok)
      throw new Error("Current team access could not be verified. Check account security.");
    setTeam(await response.json());
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      fields = new FormData(form),
      role = String(fields.get("role") ?? "staff"),
      selected = fields.getAll("permissions").map(String);
    setPending(true);
    setMessage("");
    try {
      const base = {
        action,
        version: team.merchant.version,
        confirm: fields.get("confirm") === "on",
      };
      const body =
        action === "invite"
          ? { ...base, value: { email: String(fields.get("email")), role, permissions: selected } }
          : action === "membership"
            ? {
                ...base,
                userId: String(fields.get("userId")),
                value: { role, permissions: selected, status: String(fields.get("status")) },
              }
            : action === "staff_shop"
              ? {
                  ...base,
                  value: {
                    userId: String(fields.get("userId")),
                    shopId: String(fields.get("shopId")),
                    permissions: selected,
                  },
                }
              : action === "transfer"
                ? { ...base, userId: String(fields.get("userId")) }
                : { ...base, invitationId: String(fields.get("invitationId")) };
      await command(path, body);
      if (action === "transfer") {
        router.push("/shopkeeper");
        router.refresh();
        return;
      }
      await reload();
      form.reset();
      setMessage(
        action === "invite"
          ? "Invitation queued for private development delivery. The invitee must sign in with the invited email."
          : "Team change saved.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The service is unavailable.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <h2>Team members</h2>
      <ul className="workspace-list">
        {team.members.map((member) => (
          <li key={member.user_id}>
            <strong>{member.name}</strong>
            <span>
              {member.email} · {member.role} · {member.status}
            </span>
            <span>
              {member.role === "owner"
                ? "All merchant permissions"
                : member.permissions.map((p) => labels[p]).join(", ") || "No merchant permissions"}
            </span>
            <span>
              {team.grants
                .filter((g) => g.user_id === member.user_id)
                .map(
                  (g) =>
                    `${team.shops.find((s) => s.id === g.shop_id)?.name}: ${g.permissions.map((p) => labels[p]).join(", ") || "No shop permissions"}`,
                )
                .join("; ")}
            </span>
          </li>
        ))}
      </ul>
      <h2>Pending invitations</h2>
      {team.invitations.length ? (
        <ul className="workspace-list">
          {team.invitations.map((i) => (
            <li key={i.id}>
              <strong>{i.email}</strong>
              <span>
                {i.role} · expires{" "}
                {new Date(i.expires_at).toLocaleDateString("en-UG", { timeZone: "Africa/Kampala" })}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No unexpired invitations on this page.</p>
      )}
      <h2>Manage access</h2>
      <p>
        Staff need both merchant permissions and permissions for each shop. Ownership transfer makes
        you restricted staff and ends your owner access. Every change requires recent
        authentication.
      </p>
      <form className="account-form" onSubmit={submit}>
        <label htmlFor="team-action">Team action</label>
        <select id="team-action" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="invite">Invite a member</option>
          <option value="membership">Change a membership</option>
          <option value="staff_shop">Set staff shop permissions</option>
          <option value="revoke_invitation">Revoke an invitation</option>
          <option value="transfer">Transfer my ownership</option>
        </select>
        {action === "invite" ? (
          <>
            <label htmlFor="invite-email">Invitee email</label>
            <input id="invite-email" name="email" type="email" maxLength={254} required />
          </>
        ) : null}
        {["membership", "staff_shop", "transfer"].includes(action) ? (
          <>
            <label htmlFor="member-id">Team member</label>
            <select id="member-id" name="userId" required defaultValue="">
              <option value="" disabled>
                Choose a team member
              </option>
              {team.members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.email} · {m.role} · {m.status}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {["invite", "membership"].includes(action) ? (
          <>
            <label htmlFor="member-role">Membership role</label>
            <select id="member-role" name="role" defaultValue="staff">
              <option value="staff">Staff</option>
              <option value="owner">Owner</option>
            </select>
          </>
        ) : null}
        {action === "membership" ? (
          <>
            <label htmlFor="member-status">Membership status</label>
            <select id="member-status" name="status">
              <option value="active">Active</option>
              <option value="revoked">Revoked</option>
            </select>
          </>
        ) : null}
        {action === "staff_shop" ? (
          <>
            <label htmlFor="staff-shop">Staff shop</label>
            <select id="staff-shop" name="shopId" required defaultValue="">
              <option value="" disabled>
                Choose a shop
              </option>
              {team.shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {["invite", "membership", "staff_shop"].includes(action) ? (
          <fieldset>
            <legend>Permissions</legend>
            {permissions.map((p) => (
              <label className="checkbox-label" key={p}>
                <input type="checkbox" name="permissions" value={p} />
                {labels[p]}
              </label>
            ))}
          </fieldset>
        ) : null}
        {action === "revoke_invitation" ? (
          <>
            <label htmlFor="pending-invitation">Pending invitation</label>
            <select id="pending-invitation" name="invitationId" required defaultValue="">
              <option value="" disabled>
                Choose an invitation
              </option>
              {team.invitations.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.email}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <label className="checkbox-label">
          <input type="checkbox" name="confirm" required />I reviewed the selected access change and
          confirm it
        </label>
        <button className="button" disabled={pending}>
          {pending ? "Saving…" : "Save team change"}
        </button>
      </form>
      <button
        className="button button--outline"
        disabled={pending}
        onClick={() =>
          void reload()
            .then(() => setMessage("Current team reloaded."))
            .catch((e) => setMessage(e.message))
        }
      >
        Reload team
      </button>
      <p role="status">{message}</p>
      <AccessLinks />
    </>
  );
}
export function AcceptInvitationForm() {
  const [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      fields = new FormData(form);
    setPending(true);
    setMessage("");
    try {
      await command("/api/workspace/invitations/accept", { token: String(fields.get("token")) });
      form.reset();
      setMessage("Invitation accepted. Your granted shops are available in Shopkeeper.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The invitation could not be confirmed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <form className="account-form" onSubmit={submit}>
        <label htmlFor="invitation-token">Private invitation token</label>
        <input
          id="invitation-token"
          name="token"
          type="password"
          autoComplete="off"
          minLength={32}
          maxLength={128}
          required
        />
        <button className="button" disabled={pending}>
          {pending ? "Accepting…" : "Accept invitation"}
        </button>
        <p role="status">{message}</p>
      </form>
      <AccessLinks />
    </>
  );
}
export function AddressForm({ shop }: { shop: { id: string; slug: string; version: number } }) {
  const [version, setVersion] = useState(shop.version),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    try {
      const data = await command(`/api/workspace/shops/${shop.id}/address`, {
        slug: String(fields.get("slug")),
        reason: String(fields.get("reason")),
        confirm: fields.get("confirm") === "on",
        version,
      });
      setVersion(data.version);
      setMessage(
        "Shop address saved. Former links continue to resolve while the shop is eligible.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The service is unavailable.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <form className="account-form" onSubmit={submit}>
        <label htmlFor="shop-address">Shop address slug</label>
        <input
          id="shop-address"
          name="slug"
          defaultValue={shop.slug}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          minLength={3}
          maxLength={80}
          required
        />
        <label htmlFor="address-reason">Reason for changing the address</label>
        <textarea id="address-reason" name="reason" minLength={5} maxLength={500} required />
        <label className="checkbox-label">
          <input name="confirm" type="checkbox" required />I confirm this shop address change
        </label>
        <button className="button" disabled={pending}>
          {pending ? "Saving…" : "Save shop address"}
        </button>
        <p role="status">{message}</p>
      </form>
      <button className="button button--outline" onClick={() => router.refresh()}>
        Reload shop details
      </button>
      <AccessLinks />
    </>
  );
}
export function ClaimOperationsForm({ shopId }: { shopId: string }) {
  const [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    try {
      await command(`/api/operator/shops/${shopId}/claim`, {
        reason: String(fields.get("reason")),
        confirm: fields.get("confirm") === "on",
      });
      router.push(`/landlord/operations/${shopId}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The service is unavailable.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="account-form" onSubmit={submit}>
      <label htmlFor={`claim-reason-${shopId}`}>Reason for claiming shop operations</label>
      <input id={`claim-reason-${shopId}`} name="reason" minLength={5} maxLength={500} required />
      <label className="checkbox-label">
        <input name="confirm" type="checkbox" required />I confirm this scoped investigation
      </label>
      <button className="button button--outline" disabled={pending}>
        {pending ? "Claiming…" : "Claim shop operations"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function OperationsPanel({
  initial,
  malls,
}: {
  initial: OperationsView;
  malls: { id: string; name: string; occupied: number; planning_capacity: number }[];
}) {
  const [view, setView] = useState(initial),
    [action, setAction] = useState("pause"),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const path = `/api/operator/shops/${view.shop.id}/operations`;
  async function reload() {
    const response = await fetch(path);
    if (!response.ok) throw new Error("Current operations access could not be verified.");
    setView(await response.json());
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      fields = new FormData(form);
    setPending(true);
    setMessage("");
    try {
      await command(path, {
        action,
        version: view.shop.version,
        reason: String(fields.get("reason")),
        confirm: fields.get("confirm") === "on",
        ...(action === "move" ? { mallId: String(fields.get("mallId")) } : {}),
      });
      await reload();
      form.reset();
      setMessage("Shop operation saved and audited.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The service is unavailable.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <dl className="lifecycle-summary">
        <dt>Current address</dt>
        <dd>{view.shop.slug}</dd>
        <dt>Internal mall</dt>
        <dd>{view.shop.mall_name}</dd>
        <dt>Administrative pause</dt>
        <dd>{view.shop.paused ? "Paused" : "Clear"}</dd>
        <dt>Publication</dt>
        <dd>{view.shop.publication}</dd>
        <dt>Tenancy</dt>
        <dd>{view.shop.tenancy}</dd>
        <dt>Moderation</dt>
        <dd>{view.shop.moderation}</dd>
      </dl>
      <p>
        Resume removes only the administrative pause. Rent, publication and moderation still
        determine whether customers can enter.
      </p>
      <form className="account-form" onSubmit={submit}>
        <label htmlFor="operation-action">Shop operation</label>
        <select id="operation-action" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="pause">Pause public access</option>
          <option value="resume">Remove administrative pause</option>
          <option value="move">Reassign internal mall</option>
        </select>
        {action === "move" ? (
          <>
            <label htmlFor="target-mall">Target internal mall</label>
            <select id="target-mall" name="mallId" required defaultValue="">
              <option value="" disabled>
                Choose a target mall
              </option>
              {malls.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.occupied}/{m.planning_capacity}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <label htmlFor="operation-reason">Reason for this operation</label>
        <textarea id="operation-reason" name="reason" minLength={5} maxLength={500} required />
        <label className="checkbox-label">
          <input name="confirm" type="checkbox" required />I reviewed the effect and confirm this
          operation
        </label>
        <button className="button" disabled={pending}>
          {pending ? "Saving…" : "Save shop operation"}
        </button>
      </form>
      <button
        className="button button--outline"
        disabled={pending}
        onClick={() =>
          void reload()
            .then(() => setMessage("Current operations reloaded."))
            .catch((e) => setMessage(e.message))
        }
      >
        Reload operations
      </button>
      <p role="status">{message}</p>
      <AccessLinks />
      <h2>Recent operations audit</h2>
      <ul className="workspace-list">
        {view.history.map((h, i) => (
          <li key={i}>
            <strong>{h.action}</strong>
            <span>{h.details.reason}</span>
            <span>
              {new Date(h.created_at).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
