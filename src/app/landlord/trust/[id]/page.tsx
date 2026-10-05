import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { readTrustCase } from "@/server/trust";
import { TrustCasePanel } from "@/components/trust-controls";
export const metadata = { title: "Private trust case" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!coreConfigured()) notFound();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const view = await readTrustCase(database(), await pageActor("/landlord"), id.data);
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Scoped private investigation</p>
      <h1>Trust review for {view.shop.name}</h1>
      <TrustCasePanel initial={view} />
      <Link href="/landlord/trust">Trust queue</Link>
    </section>
  );
}
