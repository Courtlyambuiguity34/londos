import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { mallOccupancy, readOperations } from "@/server/administration";
import { OperationsPanel } from "@/components/admin-controls";
export const metadata = { title: "Scoped shop operations" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    id = z.uuid().safeParse((await params).shopId);
  if (!id.success) notFound();
  const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(500)
      .parse((await searchParams).page ?? 0),
    view = await readOperations(database(), actor, id.data),
    malls = await mallOccupancy(database(), actor, page);
  return (
    <section className="shell page-section account-page">
      <h1>Operate {view.shop.name}</h1>
      <OperationsPanel key={view.shop.version} initial={view} malls={malls} />
      <div className="account-links">
        {page > 0 ? <Link href={`?page=${page - 1}`}>Previous target malls</Link> : null}
        {malls.length === 20 && page < 500 ? (
          <Link href={`?page=${page + 1}`}>Next target malls</Link>
        ) : null}
        <Link href="/landlord/operations">Operations queue</Link>
      </div>
    </section>
  );
}
