import Link from "next/link";
import { notFound } from "next/navigation";
import { CommunicationsControls } from "@/components/communications-controls";
import { coreConfigured } from "@/server/config";
import { listCommunications } from "@/server/communications";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";

export const metadata = { title: "Communications and promotions" };

export default async function CommunicationsPage() {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    data = await listCommunications(database(), actor);
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">MFA-protected operations</p>
      <h1>Communications, payment details and promotions</h1>
      <p>
        Messages use durable jobs and the configured hourly/daily limits. Payment remains manual;
        shop access changes only after a verified ledger credit or valid promotion.
      </p>
      <CommunicationsControls initial={data} />
      <Link href="/landlord">Management workspace</Link>
    </section>
  );
}
