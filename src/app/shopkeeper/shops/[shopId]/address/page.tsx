import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { requireShop, requireMerchant } from "@/server/security/authorization";
import { AddressForm } from "@/components/admin-controls";
export const metadata = { title: "Change your shop address" };
export default async function Page({ params }: { params: Promise<{ shopId: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    id = z.uuid().safeParse((await params).shopId);
  if (!id.success) notFound();
  const shop = await requireShop(database(), actor, id.data, "sensitive");
  await requireMerchant(database(), actor, shop.merchant_id, "membership");
  return (
    <section className="shell page-section account-page">
      <h1>Change your shop address</h1>
      <p>
        {shop.name} retains its permanent shop identity. Previous addresses remain reserved and
        redirect to the current address while public access is eligible.
      </p>
      <AddressForm key={shop.version} shop={shop} />
      <Link href={`/shopkeeper/shops/${shop.id}`}>Return to the shop workspace</Link>
    </section>
  );
}
