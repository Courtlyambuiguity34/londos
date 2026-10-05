import type { Metadata } from "next";
import { WorkspaceGateway } from "@/components/workspace-gateway";
import Link from "next/link";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { sessionState } from "@/server/security/authorization";
import { SignOutButton } from "@/components/auth-controls";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Londos Management" };
export default async function LandlordPage() {
  if (!coreConfigured()) return <WorkspaceGateway kind="landlord" />;
  const actor = await pageActor("/landlord"),
    session = await sessionState(database(), actor);
  const grants = (
    await database().query(
      "SELECT permission FROM operator_grants WHERE user_id=$1 ORDER BY permission",
      [actor.userId],
    )
  ).rows as { permission: string }[];
  if (!grants.length)
    return (
      <section className="shell page-section">
        <h1>Operator access is unavailable.</h1>
        <p>Your current account has no operator permissions.</p>
        <Link href="/shopkeeper" className="button">
          Shopkeeper
        </Link>
      </section>
    );
  if (!session.mfa_enabled || !session.verified_at) redirect("/security");
  const counts = grants.some((grant) => grant.permission === "jobs")
    ? ((
        await database().query(
          "SELECT state,count(*)::int AS count FROM jobs GROUP BY state ORDER BY state",
        )
      ).rows as { state: string; count: number }[])
    : [];
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">MFA-protected operator workspace</p>
      <h1>Care for the mall.</h1>
      <p>
        Current permissions: {grants.map((grant) => grant.permission).join(", ")}. Application
        review and manual rent reconciliation use scoped records and recent MFA. Live collection
        remains disabled.
      </p>
      {counts.length ? (
        <>
          <h2>Durable jobs</h2>
          <ul>
            {counts.map((row) => (
              <li key={row.state}>
                {row.state}: {row.count}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="account-links">
        {grants.some((g) => g.permission === "moderation") ? (
          <Link className="button" href="/landlord/trust">
            Review shop concerns and appeals
          </Link>
        ) : null}
        {grants.some((g) => g.permission === "review") ? (
          <Link className="button" href="/landlord/applications">
            Review applications
          </Link>
        ) : null}
        {grants.some((g) => g.permission === "finance") ? (
          <Link className="button" href="/landlord/rent">
            Reconcile development rent
          </Link>
        ) : null}
        <Link className="button" href="/security">
          Account security
        </Link>
        {grants.some((g) => g.permission === "operations") ? (
          <Link className="button" href="/landlord/operations">
            Mall and shop operations
          </Link>
        ) : null}
        {grants.some((g) => g.permission === "finance") ? (
          <Link className="button button--outline" href="/landlord/rent-exceptions">
            Outstanding rent and corrections
          </Link>
        ) : null}
        <SignOutButton />
      </div>
    </section>
  );
}
