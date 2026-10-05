import Link from "next/link";
import { notFound } from "next/navigation";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { readApplication } from "@/server/applications";
import { applicationInvoices } from "@/server/rent";
import { ApplicationPanel } from "@/components/lifecycle-controls";
import { InvoiceList } from "@/components/invoice-list";
export const metadata = { title: "Shop application" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    { id } = await params,
    data = await readApplication(database(), actor, id),
    invoices = await applicationInvoices(database(), actor, id, "owner");
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Private application</p>
      <h1>{data.application.business_name}</h1>
      <ApplicationPanel initial={data} />
      <h2>Rent invoices</h2>
      <InvoiceList invoices={invoices} />
      <Link href="/shopkeeper/applications">All applications</Link>
    </section>
  );
}
