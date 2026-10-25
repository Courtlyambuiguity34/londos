import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { readApplication } from "@/server/applications";
import { applicationInvoices } from "@/server/rent";
import { ApplicationPanel } from "@/components/lifecycle-controls";
import { InvoiceList } from "@/components/invoice-list";
import { AccountWorkspaceShell } from "@/components/account-workspace-shell";
import { AccessError } from "@/server/security/errors";
export const metadata = { title: "Shop application" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!coreConfigured()) notFound();
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const actor = await pageActor("/shopkeeper"),
    id = parsed.data,
    data = await readApplication(database(), actor, id).catch((error: unknown) => {
      if (error instanceof AccessError && error.status === 404) notFound();
      throw error;
    }),
    invoices = await applicationInvoices(database(), actor, id, "owner").catch((error: unknown) => {
      if (error instanceof AccessError && error.status === 404) notFound();
      throw error;
    });
  return (
    <AccountWorkspaceShell
      kind="shopkeeper"
      title={data.application.business_name}
      subtitle="Application details, review progress and linked rent invoices."
      currentPath="/shopkeeper/applications"
    >
      <section className="portal-section account-page">
        <ApplicationPanel initial={data} />
        <h2>Rent invoices</h2>
        <InvoiceList invoices={invoices} />
        <Link href="/shopkeeper/applications">All applications</Link>
      </section>
    </AccountWorkspaceShell>
  );
}
