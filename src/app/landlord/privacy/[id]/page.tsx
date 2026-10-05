import { notFound } from "next/navigation";
import Link from "next/link";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { readPrivacy } from "@/server/privacy";
import { PrivacyReview } from "@/components/privacy-review";
export const metadata = { title: "Scoped privacy review" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    value = await readPrivacy(database(), actor, (await params).id);
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Assigned privacy reviewer</p>
      <h1>Review {value.request.kind} erasure</h1>
      <PrivacyReview initial={JSON.parse(JSON.stringify(value))} />
      <Link href="/landlord/privacy">Privacy review queue</Link>
    </section>
  );
}
