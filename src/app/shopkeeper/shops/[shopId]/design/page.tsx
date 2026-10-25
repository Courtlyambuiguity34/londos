import { DesignManualPathNotice } from "@/components/design-manual-path-notice";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DesignWorkspace } from "@/components/design-workspace";
import { coreConfigured } from "@/server/config";
import { ShopWorkspaceShell } from "@/components/shop-workspace-shell";
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
    parsed = z.uuid().safeParse((await params).shopId);
  if (!parsed.success) notFound();
  const shopId = parsed.data;
  const shop = await requireShop(database(), actor, shopId, "design").catch((error) => {
    if (error instanceof AccessError || error instanceof z.ZodError) notFound();
    throw error;
  });
  return (
    <ShopWorkspaceShell
      shop={shop}
      section="design"
      title="Design & publish"
      subtitle="Preview privately and publish when ready."
    >
      <section className="portal-section account-page">
        <h1>{shop.name}: shop design</h1>
        <DesignWorkspace shopId={shopId} />
        <DesignManualPathNotice shopId={shopId} />
      </section>
    </ShopWorkspaceShell>
  );
}
