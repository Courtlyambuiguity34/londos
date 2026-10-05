import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ProfileForm } from "@/components/profile-form";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { AccessError } from "@/server/security/errors";
import { readSetup } from "@/server/workspace";
export const metadata = { title: "Shop workspace" };
export default async function Page({ params }: { params: Promise<{ shopId: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    parsed = z.uuid().safeParse((await params).shopId);
  if (!parsed.success) notFound();
  const setup = await readSetup(database(), actor, parsed.data).catch((error) => {
    if (error instanceof AccessError && error.status === 404) notFound();
    throw error;
  });
  const shop = setup.shop;
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Private shop profile</p>
      <h1>{shop.name}</h1>
      <p>
        Changes save to your shop. They appear in database browsing when your shop is published; the
        fictional fixture preview is separate.
      </p>
      <h2>Shop setup progress</h2>
      <ul>
        <li>Departments: {setup.departments ? "Ready" : "Add your first department"}</li>
        <li>Catalogue: {setup.products ? "Ready" : "Add a product or service"}</li>
        <li>Contacts: {setup.contacts ? "Configured" : "Choose how customers contact you"}</li>
        <li>Design: {setup.design ? "Draft saved" : "Save and preview a shop design"}</li>
        <li>Publication: {setup.publication}</li>
        <li>
          Tenancy: {setup.tenancy}; moderation: {setup.moderation}; administrative access:{" "}
          {setup.paused ? "paused" : "clear"}
        </li>
      </ul>
      <h2>Shop profile</h2>
      <ProfileForm key={shop.version} shop={shop} />
      <Link className="button" href={`/shopkeeper/shops/${shop.id}/catalogue`}>
        Manage catalogue and contacts
      </Link>
      <Link className="text-button" href="/shopkeeper">
        All your shops
      </Link>
      <Link className="button button--outline" href={`/shopkeeper/shops/${shop.id}/design`}>
        Design and publish your shop
      </Link>
      <Link className="button button--outline" href={`/shopkeeper/shops/${shop.id}/rent`}>
        Rent and tenancy
      </Link>
      {setup.role === "owner" ? (
        <>
          <h2>Shop address</h2>
          <Link className="button button--outline" href={`/shopkeeper/shops/${shop.id}/address`}>
            Change shop address
          </Link>
          <Link
            className="button button--outline"
            href={`/shopkeeper/merchants/${shop.merchant_id}/team`}
          >
            Manage this merchant team
          </Link>
        </>
      ) : null}
    </section>
  );
}
