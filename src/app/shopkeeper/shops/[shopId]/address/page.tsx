import Link from "next/link";
import { ShopWorkspaceShell } from "@/components/shop-workspace-shell";
import { notFound } from "next/navigation";
import { z } from "zod";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { requireShop, requireMerchant } from "@/server/security/authorization";
import { AccessError } from "@/server/security/errors";
import { AddressForm } from "@/components/admin-controls";
export const metadata = { title: "Change your shop address" };
export default async function Page({ params }: { params: Promise<{ shopId: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    id = z.uuid().safeParse((await params).shopId);
  if (!id.success) notFound();
  const shop = await requireShop(database(), actor, id.data, "catalogue").catch((error) => {
    if (error instanceof AccessError && error.status === 404) notFound();
    throw error;
  });
  let fresh = true;
  try {
    await requireMerchant(database(), actor, shop.merchant_id, "membership");
    await requireShop(database(), actor, id.data, "sensitive");
  } catch (error) {
    if (error instanceof AccessError && error.code === "fresh_authentication_required")
      fresh = false;
    else if (error instanceof AccessError && error.status === 404) notFound();
    else throw error;
  }
  return (
    <ShopWorkspaceShell
      shop={shop}
      section="address"
      title="Your shop address"
      subtitle="Choose a short, memorable address. Previous addresses stay reserved for your shop."
    >
      <section className="workspace-panel account-page">
        <h2>Choose your public address</h2>
        <p>
          {shop.name} retains its permanent shop identity. Previous addresses remain reserved and
          redirect to the current address while public access is eligible.
        </p>
        {fresh ? (
          <AddressForm key={shop.id} shop={shop} />
        ) : (
          <div role="status">
            <h2>Confirm your identity</h2>
            <p>
              Sign in again or verify your authenticator before changing your public shop address.
            </p>
            <Link className="button" href="/security">
              Open account security
            </Link>
          </div>
        )}
        <Link href={`/shopkeeper/shops/${shop.id}`}>Return to the shop workspace</Link>
      </section>
    </ShopWorkspaceShell>
  );
}
