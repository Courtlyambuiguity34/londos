import { notFound } from "next/navigation";
import { z } from "zod";
import { CanonicalShop } from "@/components/canonical-shop";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { AccessError } from "@/server/security/errors";
import { readPrivatePreview } from "@/server/public-shop";
export const metadata = { title: "Private shop preview" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ revision?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    shopId = z.uuid().parse((await params).shopId);
  const query = await searchParams,
    parsed = z.coerce.number().int().positive().safeParse(query.revision);
  if (query.revision !== undefined && !parsed.success) notFound();
  const view = await readPrivatePreview(
    database(),
    actor,
    shopId,
    query.revision === undefined ? undefined : parsed.data,
  ).catch((error) => {
    if (error instanceof AccessError || error instanceof z.ZodError) notFound();
    throw error;
  });
  return <CanonicalShop view={view} />;
}
