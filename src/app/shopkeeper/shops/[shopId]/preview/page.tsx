import { notFound } from "next/navigation";
import { z } from "zod";
import { CanonicalShop } from "@/components/canonical-shop";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { AccessError } from "@/server/security/errors";
import { readPrivatePreview, previewDestination } from "@/server/public-shop";
export const metadata = { title: "Private shop preview" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{
    revision?: string | string[];
    department?: string | string[];
    product?: string | string[];
    after?: string | string[];
  }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    shopId = z.uuid().parse((await params).shopId);
  const query = await searchParams,
    parsed = z.coerce.number().int().positive().safeParse(query.revision);
  if (query.revision !== undefined && (typeof query.revision !== "string" || !parsed.success))
    notFound();
  const destination = previewDestination.safeParse({
    department: query.department,
    product: query.product,
    after: query.after,
  });
  if (!destination.success) notFound();
  const view = await readPrivatePreview(
    database(),
    actor,
    shopId,
    query.revision === undefined ? undefined : parsed.data,
    destination.data,
  ).catch((error) => {
    if (error instanceof AccessError || error instanceof z.ZodError) notFound();
    throw error;
  });
  return <CanonicalShop view={view} />;
}
