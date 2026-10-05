import Link from "next/link";
import { notFound } from "next/navigation";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { applicationInvoices } from "@/server/rent";
import { InvoiceList } from "@/components/invoice-list";
export const metadata = { title: "Application rent records" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ offset?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    { id } = await params,
    offset = Number((await searchParams).offset ?? 0),
    invoices = await applicationInvoices(database(), actor, id, "finance", offset);
  return (
    <section className="shell page-section account-page">
      <h1>Application rent records</h1>
      <p>
        Verify each receipt independently before recording a development payment or waiver. Live
        collection is disabled.
      </p>
      <InvoiceList invoices={invoices} operator />
      {offset > 0 ? (
        <Link href={`?offset=${Math.max(0, offset - 20)}`}>Previous invoices</Link>
      ) : null}
      {invoices.length === 20 ? <Link href={`?offset=${offset + 20}`}>Next invoices</Link> : null}
      <p>
        <Link href="/landlord/rent">Finance queue</Link>
      </p>
    </section>
  );
}
