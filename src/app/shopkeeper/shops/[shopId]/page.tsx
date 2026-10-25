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
import { readSetup, shopStorefrontStatus, effectiveShopPermissions } from "@/server/workspace";
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
  const shop = setup.shop,
    base = `/shopkeeper/shops/${shop.id}`;
  const status = await shopStorefrontStatus(database(), shop.id);
  const permissions = await effectiveShopPermissions(database(), actor, shop.id);
  const canDesign = permissions.includes("design"),
    canFinance = permissions.includes("finance");
  const steps = [
    { label: "Add products or services", done: setup.product_count > 0, href: `${base}/catalogue` },
    {
      label: "Set customer contact details",
      done: setup.contacts,
      href: `${base}/catalogue#contacts`,
    },
    ...(canDesign
      ? [
          { label: "Save and preview a design", done: setup.design, href: `${base}/design` },
          { label: "Publish your storefront", done: status.public, href: `${base}/design` },
        ]
      : []),
  ];
  const completed = steps.filter((step) => step.done).length;
  return (
    <ShopWorkspaceShell
      shop={shop}
      section="overview"
      title={shop.name}
      subtitle="Manage this shop, prepare your storefront and see what customers can access."
      banner={
        <div className="portal-next-step">
          <div>
            <p className="portal-next-step__label">Shop setup</p>
            <strong>{status.label}</strong>
            <p>{status.detail}</p>
          </div>
          {status.next !== "support" && (status.next === "rent" ? canFinance : canDesign) ? (
            <Link className="button" href={`${base}/${status.next === "rent" ? "rent" : "design"}`}>
              {status.public
                ? "Edit design"
                : status.next === "rent"
                  ? "Review rent"
                  : "Design & publish"}{" "}
              →
            </Link>
          ) : null}
        </div>
      }
    >
      <div className="shop-overview-grid">
        <section className="workspace-panel" aria-labelledby="setup-heading">
          <h2 id="setup-heading">Get ready for customers</h2>
          <p>
            {completed} of {steps.length} suggested steps complete. You choose when to publish.
          </p>
          <progress value={completed} max={steps.length} aria-label="Shop setup progress" />
          <ol className="setup-checklist">
            {steps.map((step) => (
              <li key={step.label}>
                <span>{step.done ? "Complete" : "To do"}</span>
                <Link href={step.href}>{step.label}</Link>
              </li>
            ))}
          </ol>
        </section>
        <ShopPublicLink
          slug={shop.slug}
          shopId={shop.id}
          shopName={shop.name}
          storefront={status}
          canDesign={canDesign}
          canManageRent={canFinance}
          canEditAddress={setup.role === "owner"}
          absoluteBase={coreConfig().baseURL}
        />
      </div>
      <section className="portal-section" aria-labelledby="manage-heading">
        <div className="portal-section-heading">
          <div>
            <h2 id="manage-heading">Manage your shop</h2>
            <p>Choose a task. Each area saves changes only to this shop.</p>
          </div>
        </div>
        <div className="portal-quick-grid">
          <Link href={`${base}/catalogue`}>
            <strong>Products & contacts</strong>
            <span>Departments, items, images and customer contact details →</span>
          </Link>
          {canDesign ? (
            <Link href={`${base}/design`}>
              <strong>Design & publish</strong>
              <span>Arrange your storefront, preview and go live →</span>
            </Link>
          ) : null}
          {canFinance ? (
            <Link href={`${base}/rent`}>
              <strong>Rent & invoices</strong>
              <span>Coverage, payment references and renewals →</span>
            </Link>
          ) : null}
        </div>
      </section>
      <section className="portal-section workspace-panel" aria-labelledby="profile-heading">
        <h2 id="profile-heading">Shop profile</h2>
        <p>Your name and introduction appear on your published storefront.</p>
        <ProfileForm key={shop.id} shop={shop} />
      </section>
      {setup.role === "owner" ? (
        <details className="workspace-panel shop-more-tools">
          <summary>Business tools & account support</summary>
          <div className="portal-quick-grid">
            {coreConfig().localAdapters ? (
              <>
                <Link href={`${base}/analytics`}>
                  <strong>Shop analytics</strong>
                  <span>Recorded storefront activity →</span>
                </Link>
                <Link href={`${base}/costs`}>
                  <strong>Business costs</strong>
                  <span>Resources and reported expenses →</span>
                </Link>
              </>
            ) : null}
            <Link href={`/shopkeeper/merchants/${shop.merchant_id}/team`}>
              <strong>Team access</strong>
              <span>Manage this business's people →</span>
            </Link>
            <Link href={`${base}/incidents`}>
              <strong>Support & recovery</strong>
              <span>Report an incident or request help →</span>
            </Link>
            <Link href={`${base}/trust`}>
              <strong>Reviews & appeals</strong>
              <span>See trust decisions and submit an appeal →</span>
            </Link>
            <Link href={`/shopkeeper/merchants/${shop.merchant_id}/privacy`}>
              <strong>Business data & privacy</strong>
              <span>Export data or request a privacy review →</span>
            </Link>
          </div>
        </details>
      ) : null}
    </ShopWorkspaceShell>
  );
}
