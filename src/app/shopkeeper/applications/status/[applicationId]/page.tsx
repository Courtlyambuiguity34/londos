import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { ownedApplicationStatus } from "@/server/application-status";
import { AccessError } from "@/server/security/errors";

export const metadata = { title: "Application status" };

export default async function Page({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  if (!coreConfigured()) notFound();
  const parsed = z.uuid().safeParse((await params).applicationId);
  if (!parsed.success) notFound();
  const actor = await pageActor("/shopkeeper");
  const application = await ownedApplicationStatus(database(), actor, parsed.data).catch(
    (error: unknown) => {
      if (error instanceof AccessError && error.status === 404) notFound();
      throw error;
    },
  );
  return (
    <section className="shell page-section account-page">
      <h1>{application.business_name}</h1>
      <p>Application status: {application.state.replaceAll("_", " ")}</p>
      <p>This page is read-only. Changes, evidence and approval actions are available only through authorized workflows.</p>
      {application.provisioned_shop_id ? (
        <Link className="button" href={`/shopkeeper/shops/${application.provisioned_shop_id}`}>
          Manage shop
        </Link>
      ) : null}
      <Link href="/shopkeeper/applications">All applications</Link>
    </section>
  );
}
