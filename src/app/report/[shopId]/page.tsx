import { notFound } from "next/navigation";
import { z } from "zod";
import { coreConfigured } from "@/server/config";
import { PublicReportForm } from "@/components/trust-controls";
export const dynamic = "force-dynamic";
export const metadata = { title: "Report a shop concern" };
export default async function Page({ params }: { params: Promise<{ shopId: string }> }) {
  if (!coreConfigured()) notFound();
  const shopId = z.uuid().safeParse((await params).shopId);
  if (!shopId.success) notFound();
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Londos customer safety</p>
      <h1>Report a shop concern</h1>
      <p>
        Describe a concern for private platform review. Reporting does not automatically close a
        shop. Do not include passwords, identity documents or banking credentials. For urgent
        threats, contact the appropriate emergency services.
      </p>
      <PublicReportForm shopId={shopId.data} />
      <p className="notice">After submitting, keep the reference number displayed by the form for follow-up. A report is reviewed privately and does not automatically suspend a shop.</p>
    </section>
  );
}
