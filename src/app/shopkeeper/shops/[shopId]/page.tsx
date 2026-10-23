import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ProfileForm } from "@/components/profile-form";
import { ShopWorkspaceShell } from "@/components/shop-workspace-shell";
import { ShopPublicLink } from "@/components/shop-public-link";
import { database } from "@/server/db/pool";
import { coreConfigured, coreConfig } from "@/server/config";
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
  const steps = [
    {
      label: "Add a department",
      done: setup.departments,
      href: `/shopkeeper/shops/${shop.id}/catalogue`,
    },
    {
      label: "Add three products or services",
      done: setup.product_count >= 3,
      href: `/shopkeeper/shops/${shop.id}/catalogue`,
    },
    {
      label: "Choose how customers contact you",
      done: setup.contacts,
      href: `/shopkeeper/shops/${shop.id}/catalogue`,
    },
    {
      label: "Save and preview your design",
      done: setup.design,
      href: `/shopkeeper/shops/${shop.id}/design`,
    },
    {
      label: "Publish your shop",
      done: setup.publication === "active",
      href: `/shopkeeper/shops/${shop.id}/design`,
    },
  ];
  const completed = steps.filter((step) => step.done).length;
  return (
    <ShopWorkspaceShell shop={shop} section="overview" title={`${shop.name} · Overview`} subtitle="Complete your shop setup, manage your business and share your storefront."><section className="portal-section account-page">
      <p className="eyebrow">Private shop profile</p>
      <h1>{shop.name}</h1>
      <p>
        Changes save to this shop. Public catalogue changes appear when your shop is published and
        eligible for browsing. Preview your design before publishing it.
      </p>
      <ShopPublicLink slug={shop.slug} shopName={shop.name} published={setup.publication === "active"} absoluteBase={coreConfig().baseURL} />
      <h2>Shop setup progress</h2>
      <p>
        {completed} of {steps.length} suggested steps complete. Three products is a suggestion, not
        a publication requirement. Choose the contact actions in your design too.
      </p>
      <progress value={completed} max={steps.length} aria-label="Shop setup progress" />
      <ol className="setup-checklist">
        {steps.map((step) => (
          <li key={step.label}>
            <span>{step.done ? "Complete" : "Next step"}</span>
            <Link href={step.href}>{step.label}</Link>
          </li>
        ))}
      </ol>
      <details>
        <summary>Current shop status and restrictions</summary>
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
      </details>
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
          <Link className="button button--outline" href={`/shopkeeper/shops/${shop.id}/analytics`}>
            Shop analytics
          </Link>
          <Link className="button button--outline" href={`/shopkeeper/shops/${shop.id}/costs`}>
            Resources and reported costs
          </Link>
          <Link className="button button--outline" href={`/shopkeeper/shops/${shop.id}/incidents`}>
            Report an incident or request recovery
          </Link>
          <Link className="button button--outline" href={`/shopkeeper/shops/${shop.id}/trust`}>
            Trust decisions and appeals
          </Link>
          <Link
            className="button button--outline"
            href={`/shopkeeper/merchants/${shop.merchant_id}/privacy`}
          >
            Business data and privacy
          </Link>
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
    </section></ShopWorkspaceShell>
  );
}
