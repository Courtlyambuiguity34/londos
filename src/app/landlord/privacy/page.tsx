import { notFound } from "next/navigation";
import Link from "next/link";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { privacyQueue } from "@/server/privacy";
import { PrivacyQueue } from "@/components/privacy-review";
export const metadata = { title: "Privacy review queue" };
export default async function Page() {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    rows = await privacyQueue(database(), actor);
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Native fresh MFA and explicit privacy authority</p>
      <h1>Privacy reviews</h1>
      <PrivacyQueue initial={JSON.parse(JSON.stringify(rows))} />
      <Link href="/landlord">Operator workspace</Link>
    </section>
  );
}
