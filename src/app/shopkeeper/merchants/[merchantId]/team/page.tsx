import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AccountWorkspaceShell } from "@/components/account-workspace-shell";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { readTeam, teamPageInput } from "@/server/team";
import { AccessError } from "@/server/security/errors";
import { TeamPanel } from "@/components/admin-controls";
export const metadata = { title: "Merchant team management" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ merchantId: string }>;
  searchParams: Promise<{
    page?: string;
    membersPage?: string;
    invitationsPage?: string;
    shopsPage?: string;
  }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    id = z.uuid().safeParse((await params).merchantId),
    pages = teamPageInput.safeParse(await searchParams);
  if (!id.success || !pages.success) notFound();
  const view = await readTeam(database(), actor, id.data, pages.data.page, pages.data).catch(
    (error) => {
      if (error instanceof AccessError && error.code === "fresh_authentication_required")
        return null;
      if (error instanceof AccessError && error.status === 404) notFound();
      throw error;
    },
  );
  return (
    <AccountWorkspaceShell
      kind="shopkeeper"
      title={view ? `Manage ${view.merchant.name}` : "Team access"}
      subtitle="Manage team membership and permissions for each shop."
      currentPath="/shopkeeper/team"
    >
      <section className="portal-section account-page workspace-team-page">
        {view ? (
          <TeamPanel
            key={`${id.data}:${JSON.stringify(view.pagination)}:${view.merchant.version}`}
            initial={view}
          />
        ) : (
          <div role="status">
            <h2>Confirm your identity</h2>
            <p>
              Sign in again or verify your authenticator before viewing or changing team access.
            </p>
            <Link className="button" href="/security">
              Open account security
            </Link>
          </div>
        )}
        <Link href="/shopkeeper/team">All your teams</Link>
      </section>
    </AccountWorkspaceShell>
  );
}
