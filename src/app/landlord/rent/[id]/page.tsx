import Link from "next/link";
import { AccountWorkspaceShell } from "@/components/account-workspace-shell";
import { notFound } from "next/navigation";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { applicationInvoices, listPolicies } from "@/server/rent";
import { applicationAccess } from "@/server/lifecycle-common";
import { IssueApplicationInvoice } from "@/components/issue-application-invoice";
import { CreateRentPolicy } from "@/components/create-rent-policy";
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
    invoices = await applicationInvoices(database(), actor, id, "finance", offset),
    application = await applicationAccess(database(), actor, id, "finance"),
    policies = application.state === "approved" && !invoices.some(i => i.kind === "initial") ? await listPolicies(database(), actor, "finance") : [];
  return (
    <AccountWorkspaceShell kind="landlord" title="Application rent records" subtitle="Review linked invoices and independently verified payments." currentPath="/landlord/rent"><section className="portal-section account-page">
      <h1>Application rent records</h1>
      <p>
        Verify each receipt independently before recording a development payment or waiver. Live
        collection is disabled.
      </p>
      {application.state === "approved" && !invoices.some(i => i.kind === "initial") ? <><IssueApplicationInvoice applicationId={id} policies={policies} /><CreateRentPolicy /></> : null}
      <InvoiceList invoices={invoices} operator />
      {offset > 0 ? (
        <Link href={`?offset=${Math.max(0, offset - 20)}`}>Previous invoices</Link>
      ) : null}
      {invoices.length === 20 ? <Link href={`?offset=${offset + 20}`}>Next invoices</Link> : null}
      <p>
        <Link href="/landlord/rent">Finance queue</Link>
      </p>
    </section></AccountWorkspaceShell>
  );
}
