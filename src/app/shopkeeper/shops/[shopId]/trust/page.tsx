import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { ownerTrust } from "@/server/trust";
import { OwnerTrustPanel } from "@/components/trust-controls";
export const metadata = { title: "Shop trust decisions and appeals" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const id = z.uuid().safeParse((await params).shopId);
  if (!id.success) notFound();
  const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(500)
      .parse((await searchParams).page ?? 0),
    view = await ownerTrust(database(), await pageActor("/shopkeeper"), id.data, page);
  return (
    <section className="shell page-section account-page">
      <h1>Shop trust decisions and appeals</h1>
      <OwnerTrustPanel shopId={id.data} initial={view} />
      <div className="account-links">
        {page > 0 ? <Link href={`?page=${page - 1}`}>Previous decisions</Link> : null}
        {view.cases.length === 20 && page < 500 ? (
          <Link href={`?page=${page + 1}`}>Next decisions</Link>
        ) : null}
        <Link href={`/shopkeeper/shops/${id.data}`}>Shop workspace</Link>
      </div>
    </section>
  );
}
