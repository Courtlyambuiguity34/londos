import Link from "next/link";
import { notFound } from "next/navigation";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { shopRent } from "@/server/rent";
import { RenewalButton } from "@/components/lifecycle-controls";
import { InvoiceList } from "@/components/invoice-list";
import { tenancyLabels, rentGraceDeadline } from "@/modules/rent-presentation";
export const metadata = { title: "Rent and tenancy" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ offset?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    { shopId } = await params,
    offset = Number((await searchParams).offset ?? 0),
    data = await shopRent(database(), actor, shopId, offset);
  const deadline = rentGraceDeadline(data.tenancy.period_end, data.tenancy.grace_days);
  return (
    <section className="shell page-section account-page">
      <h1>Rent and tenancy</h1>
      <p>
        Tenancy: <strong>{tenancyLabels[data.tenancy.state] ?? data.tenancy.state}</strong>
      </p>
      {data.tenancy.period_end ? (
        <p>Coverage ends: {new Date(data.tenancy.period_end).toISOString()}</p>
      ) : null}
      {deadline && ["due", "grace"].includes(data.tenancy.state) ? (
        <p>
          Grace deadline:{" "}
          <time dateTime={deadline.toISOString()}>
            {deadline.toLocaleString("en-UG", { timeZone: "Africa/Kampala" })} (East Africa Time)
          </time>
          . Submit your reference for review before this deadline; submitting a claim does not
          extend coverage.
        </p>
      ) : null}
      <p>
        Closure retains your catalogue and layout. Renewal preserves any separate moderation
        restriction.
      </p>
      {data.tenancy.policy_id ? (
        <RenewalButton shopId={shopId} version={data.tenancy.version} />
      ) : (
        <p>
          This original sample shop has no P8 rent contract. New approved applications demonstrate
          the complete local rent workflow.
        </p>
      )}
      <InvoiceList invoices={data.invoices} />
      {offset > 0 ? (
        <Link href={`?offset=${Math.max(0, offset - 20)}`}>Previous invoices</Link>
      ) : null}
      {data.invoices.length === 20 ? (
        <Link href={`?offset=${offset + 20}`}>Next invoices</Link>
      ) : null}
      <p>
        <Link href={`/shopkeeper/shops/${shopId}`}>Shop workspace</Link>
      </p>
    </section>
  );
}
