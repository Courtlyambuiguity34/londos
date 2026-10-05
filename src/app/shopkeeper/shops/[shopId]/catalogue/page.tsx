import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CatalogueWorkspace } from "@/components/catalogue-workspace";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { readShop } from "@/server/workspace";
import { AccessError } from "@/server/security/errors";
export const metadata = { title: "Shop catalogue" };
export default async function Page({ params }: { params: Promise<{ shopId: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    parsed = z.uuid().safeParse((await params).shopId);
  if (!parsed.success) notFound();
  const shop = await readShop(database(), actor, parsed.data).catch((error) => {
    if (error instanceof AccessError && error.status === 404) notFound();
    throw error;
  });
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Private catalogue</p>
      <h1>{shop.name}</h1>
      <p>
        Maintain your departments, products, images, contact settings and customer requests here.
      </p>
      <Link className="text-button" href={`/shopkeeper/shops/${shop.id}`}>
        Shop profile
      </Link>
      <CatalogueWorkspace shopId={shop.id} />
    </section>
  );
}
