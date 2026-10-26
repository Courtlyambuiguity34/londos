import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal-shell";
import { ShopPublicLink } from "@/components/shop-public-link";
import { coreConfig } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { effectiveShopPermissions, shopStorefrontStatus } from "@/server/workspace";
import { merchantAccountLinks } from "@/modules/workspace-links";
import Link from "next/link";
type ShopRef = { id: string; name: string; slug: string; role?: string; merchant_id?: string };
export async function ShopWorkspaceShell({
  shop,
  section,
  title,
  subtitle,
  children,
  banner,
}: {
  shop: ShopRef;
  section:
    "overview" | "catalogue" | "design" | "rent" | "analytics" | "costs" | "address" | "assistant";
  title: string;
  subtitle: string;
  children: ReactNode;
  published?: boolean;
  banner?: ReactNode;
}) {
  const base = `/shopkeeper/shops/${shop.id}`;
  const path =
    section === "overview"
      ? base
      : section === "assistant"
        ? `${base}/design/assistant`
        : `${base}/${section}`;
  const actor = await pageActor("/shopkeeper");
  const permissions = await effectiveShopPermissions(database(), actor, shop.id);
  const status = await shopStorefrontStatus(database(), shop.id);
  const links = [
    ...(permissions.includes("catalogue")
      ? [
          { href: base, label: "Shop overview" },
          { href: `${base}/catalogue`, label: "Products & contacts", group: "Your shop" },
        ]
      : []),
    ...(permissions.includes("design")
      ? [{ href: `${base}/design`, label: "Design & publish" }]
      : []),
    ...(permissions.includes("finance")
      ? [{ href: `${base}/rent`, label: "Rent & invoices", group: "Subscription" }]
      : []),
    ...merchantAccountLinks,
  ];
  return (
    <PortalShell
      kind="shopkeeper"
      title={title}
      contextName={shop.name}
      subtitle={subtitle}
      links={links}
      currentPath={path}
      actions={
        permissions.includes("membership") ? (
          <Link
            className="button button--outline"
            href={
              shop.merchant_id
                ? `/shopkeeper/merchants/${shop.merchant_id}/team#invite`
                : "/shopkeeper/team"
            }
          >
            Invite a teammate <span aria-hidden="true">+</span>
          </Link>
        ) : undefined
      }
      banner={
        banner ?? (
          <div className="portal-next-step portal-next-step--compact">
            <div>
              <p className="portal-next-step__label">{shop.name}</p>
              <strong>{status.label}</strong>
              <p>{status.detail}</p>
            </div>
            <ShopPublicLink
              slug={shop.slug}
              shopId={shop.id}
              absoluteBase={coreConfig().baseURL}
              storefront={status}
              canDesign={permissions.includes("design")}
              canManageRent={permissions.includes("finance")}
              compact
            />
          </div>
        )
      }
    >
      {children}
    </PortalShell>
  );
}
