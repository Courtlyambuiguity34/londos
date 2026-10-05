import Link from "next/link";
import { notFound } from "next/navigation";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { readInvoice } from "@/server/rent";
import { InvoicePanel } from "@/components/lifecycle-controls";
export const metadata = { title: "Rent invoice" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    data = await readInvoice(database(), actor, (await params).id);
  return (
    <section className="shell page-section account-page">
      <h1>Rent invoice</h1>
      <InvoicePanel initial={data} />
      <Link href="/shopkeeper/applications">Your applications</Link>
    </section>
  );
}
