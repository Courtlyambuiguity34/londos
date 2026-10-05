import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { readTeam } from "@/server/team";
import { TeamPanel } from "@/components/admin-controls";
export const metadata = { title: "Merchant team management" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ merchantId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    id = z.uuid().safeParse((await params).merchantId);
  if (!id.success) notFound();
  const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(500)
      .parse((await searchParams).page ?? 0),
    view = await readTeam(database(), actor, id.data, page);
  return (
    <section className="shell page-section account-page">
      <h1>Manage {view.merchant.name}</h1>
      <TeamPanel key={`${id.data}:${page}:${view.merchant.version}`} initial={view} />
      <div className="account-links">
        {page > 0 ? <Link href={`?page=${page - 1}`}>Previous team page</Link> : null}
        {view.next && page < 500 ? <Link href={`?page=${page + 1}`}>Next team page</Link> : null}
        <Link href="/shopkeeper/team">All your teams</Link>
      </div>
    </section>
  );
}
