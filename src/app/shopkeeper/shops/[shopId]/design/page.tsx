import { notFound } from "next/navigation";
import { z } from "zod";
import { DesignWorkspace } from "@/components/design-workspace";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { AccessError } from "@/server/security/errors";
import { requireShop } from "@/server/security/authorization";
export const metadata = { title: "Private shop design" };
export default async function Page({
  params,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ revision?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    shopId = z.uuid().parse((await params).shopId);
  const shop = await requireShop(database(), actor, shopId, "design").catch((error) => {
    if (error instanceof AccessError || error instanceof z.ZodError) notFound();
    throw error;
  });
  return (
    <section className="shell page-section account-page">
      <h1>{shop.name}: shop design</h1>
      <DesignWorkspace shopId={shopId} />
    </section>
  );
}
