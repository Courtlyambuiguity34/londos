import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { readOperatorIncident } from "@/server/incidents";
import { OperatorIncidentPanel } from "@/components/incident-controls";
export const metadata = { title: "Assigned private incident" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!coreConfigured()) notFound();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const view = await readOperatorIncident(database(), await pageActor("/landlord"), id.data);
  return (
    <section className="shell page-section account-page">
      <h1>Incident review for {view.shop.name}</h1>
      <OperatorIncidentPanel initial={view} />
      <Link href="/landlord/incidents">Incident queue</Link>
    </section>
  );
}
