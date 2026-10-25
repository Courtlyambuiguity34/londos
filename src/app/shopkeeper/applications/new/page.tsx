import { notFound } from "next/navigation";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { sessionState } from "@/server/security/authorization";
import { CreateApplicationForm } from "@/components/lifecycle-controls";
import { AccountWorkspaceShell } from "@/components/account-workspace-shell";
export const metadata = { title: "Apply for a shop" };
export default async function Page() {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper");
  await sessionState(database(), actor);
  const merchants = (
    await database().query(
      "SELECT m.id,m.name FROM merchants m JOIN memberships g ON g.merchant_id=m.id WHERE g.user_id=$1 AND g.role='owner' AND g.status='active' ORDER BY m.name,m.id LIMIT 50",
      [actor.userId],
    )
  ).rows;
  return (
    <AccountWorkspaceShell
      kind="shopkeeper"
      title="Apply for a shop"
      subtitle="Save your business details, add evidence and submit for review."
      currentPath="/shopkeeper/applications/new"
    >
      <section className="portal-section account-page">
        <p>
          Save your details first, then add private verification images and submit for review. The
          displayed rent policy and payment instructions will be confirmed after review. Never pay
          until you receive official instructions from Londos.
        </p>
        <CreateApplicationForm merchants={merchants} />
      </section>
    </AccountWorkspaceShell>
  );
}
