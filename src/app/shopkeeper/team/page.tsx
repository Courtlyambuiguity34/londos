import Link from "next/link";
import { WorkspaceTaskLink } from "@/components/workspace-cards";
import { AccountWorkspaceShell } from "@/components/account-workspace-shell";
import { notFound } from "next/navigation";
import { z } from "zod";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { ownedMerchants } from "@/server/team";
export const metadata = { title: "Your merchant teams" };
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    parsed = z.coerce
      .number()
      .int()
      .min(0)
      .max(500)
      .safeParse((await searchParams).page ?? 0);
  if (!parsed.success) notFound();
  const page = parsed.data,
    merchants = await ownedMerchants(database(), actor, page);
  return (
    <AccountWorkspaceShell
      kind="shopkeeper"
      title="Better business, together."
      subtitle="Invite your people. Share the workload. Keep control of who can do what."
      currentPath="/shopkeeper/team"
    >
      <section className="portal-section account-page">
        <div className="workspace-team-intro">
          <span className="workspace-eyebrow">Team & access</span>
          <h2>Who is on your team?</h2>
          <p>
            Choose a business below to invite someone or update access. Invitations are private and
            expire after 48 hours. Only an owner can send them.
          </p>
          <Link className="text-button" href="/shopkeeper/invitations">
            Received an invitation? Join a team →
          </Link>
        </div>
        <div className="workspace-team-businesses">
          {merchants.map((merchant) => (
            <article className="workspace-panel" key={merchant.id}>
              <div className="workspace-team-business-heading">
                <span className="portal-shop-avatar" aria-hidden="true">
                  {merchant.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <span className="workspace-eyebrow">Business you own</span>
                  <h3>{merchant.name}</h3>
                </div>
              </div>
              <p>Keep membership, invitations and shop permissions in one place.</p>
              <div className="button-row">
                <Link className="button" href={`/shopkeeper/merchants/${merchant.id}/team#invite`}>
                  Invite a teammate +
                </Link>
                <Link className="text-button" href={`/shopkeeper/merchants/${merchant.id}/team`}>
                  Manage team →
                </Link>
              </div>
            </article>
          ))}
        </div>
        {!merchants.length ? (
          <div className="portal-empty">
            <h3>No owned businesses on this page</h3>
            <p>
              If you are staff, ask the business owner to send invitations and manage access. You
              can accept an invitation sent to your email.
            </p>
            <WorkspaceTaskLink href="/shopkeeper/invitations" title="Received invitations">
              Open the private link from your invitation email to join.
            </WorkspaceTaskLink>
          </div>
        ) : null}
        <div className="account-links">
          {page > 0 ? <Link href={`?page=${page - 1}`}>Previous page</Link> : null}
          {merchants.length === 20 && page < 500 ? (
            <Link href={`?page=${page + 1}`}>Next page</Link>
          ) : null}
          <Link href="/shopkeeper">Your shops</Link>
        </div>
      </section>
    </AccountWorkspaceShell>
  );
}
