import type { ReactNode } from "react";
import { PortalShell, type PortalLink } from "@/components/portal-shell";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { coreConfig } from "@/server/config";
import { merchantAccountLinks } from "@/modules/workspace-links";

export async function AccountWorkspaceShell({
  kind,
  title,
  subtitle,
  currentPath,
  children,
  banner,
  extraLinks = [],
}: {
  kind: "shopkeeper" | "landlord";
  title: string;
  subtitle: string;
  currentPath: string;
  children: ReactNode;
  banner?: ReactNode;
  extraLinks?: PortalLink[];
}) {
  let links: PortalLink[] = merchantAccountLinks;
  if (kind === "landlord") {
    const actor = await pageActor("/landlord");
    const grants = (
      await database().query<{ permission: string }>(
        "SELECT permission FROM operator_grants WHERE user_id=$1",
        [actor.userId],
      )
    ).rows.map((row) => row.permission);
    const can = (...permissions: string[]) =>
      permissions.some((permission) => grants.includes(permission));
    const available = [
      {
        href: "/landlord/applications",
        label: "Applications",
        group: "Shops & tenants",
        allowed: can("review"),
      },
      {
        href: "/landlord/operations",
        label: "Shop operations",
        group: "Shops & tenants",
        allowed: can("operations"),
      },
      { href: "/landlord/rent", label: "Rent desk", group: "Finance", allowed: can("finance") },
      {
        href: "/landlord/rent-exceptions",
        label: "Rent exceptions",
        group: "Finance",
        allowed: can("finance"),
      },
      {
        href: "/landlord/incidents",
        label: "Incidents & support",
        group: "Support",
        allowed: can("recovery", "support", "moderation", "finance", "review"),
      },
      {
        href: "/landlord/trust",
        label: "Concerns & appeals",
        group: "Support",
        allowed: can("moderation"),
      },
      {
        href: "/landlord/privacy",
        label: "Privacy requests",
        group: "Support",
        allowed: can("privacy"),
      },
      {
        href: "/landlord/communications",
        label: "Communications",
        group: "Administration",
        allowed: can("operations"),
      },
      {
        href: "/landlord/services",
        label: "Service configuration",
        group: "Administration",
        allowed: can("operations"),
      },
      {
        href: "/landlord/analytics",
        label: "Pilot analytics",
        group: "Insights",
        allowed: coreConfig().localAdapters && can("analytics"),
      },
      {
        href: "/landlord/costs",
        label: "Resources & costs",
        group: "Insights",
        allowed: coreConfig().localAdapters && can("costs"),
      },
      { href: "/security", label: "Account security", group: "Account", allowed: true },
    ];
    links = available
      .filter((link) => link.allowed)
      .map(({ href, label, group }) => ({ href, label, group }));
  }
  return (
    <PortalShell
      kind={kind}
      title={title}
      subtitle={subtitle}
      currentPath={currentPath}
      links={[
        ...links,
        ...extraLinks.filter((link) => !links.some((item) => item.href === link.href)),
      ]}
      banner={banner}
    >
      {children}
    </PortalShell>
  );
}
