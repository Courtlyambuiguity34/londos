import Link from "next/link";
import { notFound } from "next/navigation";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { readInvoice } from "@/server/rent";
import { InvoicePanel } from "@/components/lifecycle-controls";
export const metadata = { title: "Reconcile rent invoice" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    data = await readInvoice(database(), actor, (await params).id, "finance");
  return (
    <section className="shell page-section account-page">
      <h1>Reconcile rent invoice</h1>
      <InvoicePanel initial={data} operator />
      <Link href="/landlord/rent">Finance queue</Link>
    </section>
  );
}
