import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { readInvoice } from "@/server/rent";
import { InvoicePanel } from "@/components/lifecycle-controls";
import { AccountWorkspaceShell } from "@/components/account-workspace-shell";
import { AccessError } from "@/server/security/errors";
export const metadata = { title: "Rent invoice" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!coreConfigured()) notFound();
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const actor = await pageActor("/shopkeeper"),
    data = await readInvoice(database(), actor, parsed.data).catch((error: unknown) => {
      if (error instanceof AccessError && error.status === 404) notFound();
      throw error;
    });
  return (
    <AccountWorkspaceShell
      kind="shopkeeper"
      title="Rent invoice"
      subtitle="Review your coverage, payment instructions and submitted references."
      currentPath="/shopkeeper/applications"
    >
      <section className="portal-section account-page">
        <InvoicePanel initial={data} />
        <Link href="/shopkeeper/applications">Your applications</Link>
      </section>
    </AccountWorkspaceShell>
  );
}
