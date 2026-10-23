import { PrivacyHonestyNotice } from "@/components/privacy-honesty-notice";
import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { privacyInventory } from "@/server/privacy";
import { PrivacyWorkspace } from "@/components/privacy-workspace";
export const metadata = { title: "Business data and privacy" };
export default async function Page({ params }: { params: Promise<{ merchantId: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    result = await privacyInventory(database(), actor, (await params).merchantId);
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Fresh owner access</p>
      <h1>Business data and privacy</h1>
      <PrivacyHonestyNotice />
      <PrivacyWorkspace initial={JSON.parse(JSON.stringify(result))} />
      <Link href="/shopkeeper">Your shops</Link>
    </section>
  );
}
