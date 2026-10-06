import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { pageActor } from "@/server/page-actor";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { AccessError } from "@/server/security/errors";
import { readAssistantPreview } from "@/server/ai-design/service";
import { CanonicalShop } from "@/components/canonical-shop";
export const metadata = { title: "Private proposal preview" };
export default async function Page({
  params,
}: {
  params: Promise<{ shopId: string; id: string }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    p = await params;
  const view = await readAssistantPreview(
    database(),
    actor,
    z.uuid().parse(p.shopId),
    z.uuid().parse(p.id),
  ).catch((error) => {
    if (error instanceof AccessError || error instanceof z.ZodError) notFound();
    throw error;
  });
  return (
    <>
      <div className="shell">
        <Link prefetch={false} href={`/shopkeeper/shops/${p.shopId}/design/assistant`}>
          Return to proposal review
        </Link>
      </div>
      <CanonicalShop view={view} proposal />
    </>
  );
}
