import Link from "next/link";
import { notFound } from "next/navigation";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { readApplication } from "@/server/applications";
import { listPolicies } from "@/server/rent";
import { ApplicationPanel } from "@/components/lifecycle-controls";
export const metadata = { title: "Review application" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    data = await readApplication(database(), actor, (await params).id, "review"),
    policies = await listPolicies(database(), actor);
  return (
    <section className="shell page-section account-page">
      <h1>Review {data.application.business_name}</h1>
      <ApplicationPanel initial={data} operator policies={policies} />
      <div className="button-row">
        <Link href="/landlord/applications">Application queue</Link>
        <Link href="/landlord/rent">Finance queue</Link>
      </div>
    </section>
  );
}
