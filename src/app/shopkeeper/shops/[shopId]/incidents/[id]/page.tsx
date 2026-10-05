import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { readOwnerIncident } from "@/server/incidents";
import { OwnerIncidentPanel } from "@/components/incident-controls";
export const metadata = { title: "Own-shop incident request" };
export default async function Page({
  params,
}: {
  params: Promise<{ shopId: string; id: string }>;
}) {
  if (!coreConfigured()) notFound();
  const p = await params,
    shopId = z.uuid().safeParse(p.shopId),
    id = z.uuid().safeParse(p.id);
  if (!shopId.success || !id.success) notFound();
  const view = await readOwnerIncident(
    database(),
    await pageActor("/shopkeeper"),
    shopId.data,
    id.data,
  );
  return (
    <section className="shell page-section account-page">
      <h1>Your shop incident</h1>
      <OwnerIncidentPanel shopId={shopId.data} initial={view} />
      <Link href={`/shopkeeper/shops/${shopId.data}/incidents`}>Shop incidents</Link>
    </section>
  );
}
