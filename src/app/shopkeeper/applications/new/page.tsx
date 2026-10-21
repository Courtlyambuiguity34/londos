import { notFound } from "next/navigation";
import { coreConfigured, coreConfig } from "@/server/config";
import { ApplicationsUnavailable } from "@/components/applications-unavailable";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { sessionState } from "@/server/security/authorization";
import { CreateApplicationForm } from "@/components/lifecycle-controls";
export const metadata = { title: "Apply for a shop" };
export default async function Page() {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper");
  await sessionState(database(), actor);
  if (!coreConfig().localAdapters) return <ApplicationsUnavailable />;
  const merchants = (
    await database().query(
      "SELECT m.id,m.name FROM merchants m JOIN memberships g ON g.merchant_id=m.id WHERE g.user_id=$1 AND g.role='owner' AND g.status='active' ORDER BY m.name,m.id LIMIT 50",
      [actor.userId],
    )
  ).rows;
  return (
    <section className="shell page-section account-page">
      <h1>Apply for a shop</h1>
      <p>
        Save your details first, then add private verification images and submit for review. The
        development policy is UGX 5,000 per 30 days with seven days of grace. Live collection is
        disabled.
      </p>
      <CreateApplicationForm merchants={merchants} />
    </section>
  );
}
