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
      <aside className="report-promise" role="note"><h2>What happens after you report?</h2><p>Londos records the concern for authorized review. A report is not a confirmed finding and does not automatically suspend a merchant.</p><p>Reviewers may request more details, investigate, or close a report when evidence is insufficient. We cannot promise an immediate response or a particular outcome.</p><p>Keep any reference shown after submission for follow-up. Never share passwords, PINs or payment credentials in your report.</p></aside>
      <PublicReportForm shopId={shopId.data} />
      <p className="notice">After submitting, keep the reference number displayed by the form for follow-up. A report is reviewed privately and does not automatically suspend a shop.</p>
    </section>
  );
}
