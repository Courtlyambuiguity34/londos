import Link from "next/link";
import { notFound } from "next/navigation";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { shopRent } from "@/server/rent";
import { RenewalButton } from "@/components/lifecycle-controls";
import { InvoiceList } from "@/components/invoice-list";
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
  return (
    <section className="shell page-section account-page">
      <h1>Rent and tenancy</h1>
      <p>
        Tenancy: <strong>{data.tenancy.state}</strong>
      </p>
      {data.tenancy.period_end ? (
        <p>Coverage ends: {new Date(data.tenancy.period_end).toISOString()}</p>
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
