import { Icon } from "@/components/icon";
import { operatorQueueCounts } from "@/server/operator-queue-counts";
import type { Metadata } from "next";
import { WorkspaceGateway } from "@/components/workspace-gateway";
import Link from "next/link";
import { WorkspaceWelcome, WorkspaceTaskLink } from "@/components/workspace-cards";
import { PortalIcon } from "@/components/portal-icon";
import { PortalShell } from "@/components/portal-shell";
import { coreConfigured, coreConfig } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { sessionState } from "@/server/security/authorization";
import { workspaceAccess } from "@/server/navigation";
import { SignOutButton } from "@/components/auth-controls";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Londos Management" };
export default async function LandlordPage() {
  if (!coreConfigured()) return <WorkspaceGateway kind="landlord" />;
  const actor = await pageActor("/landlord"),
    session = await sessionState(database(), actor);
  const grants = (
    await database().query(
      "SELECT permission FROM operator_grants WHERE user_id=$1 ORDER BY permission",
      [actor.userId],
    )
  ).rows as { permission: string }[];
  if (!grants.length) {
    const access = await workspaceAccess();
    return (
      <section className="shell page-section">
        <h1>Operator access is unavailable.</h1>
        <p>Your current account has no operator permissions.</p>
        {access.shopkeeper ? (
          <Link href="/shopkeeper" className="button">
            Shopkeeper
          </Link>
        ) : (
          <Link href="/" className="button">
            Return to mall
          </Link>
        )}
      </section>
    );
  }
  if (!session.mfa_enabled || !session.verified_at) redirect("/security");
  const counts = grants.some((grant) => grant.permission === "jobs")
    ? ((
        await database().query(
          "SELECT state,count(*)::int AS count FROM jobs GROUP BY state ORDER BY state",
        )
      ).rows as { state: string; count: number }[])
    : [];
  const can = (permission: string) => grants.some((grant) => grant.permission === permission);
  const canAny = (...permissions: string[]) => permissions.some(can);
  const groups = [
    {
      title: "Shops and tenants",
      description: "Review new merchants and manage existing mall spaces.",
      links: [
        {
          href: "/landlord/applications",
          label: "Review applications",
          description: "Assess shop applications",
          allowed: can("review"),
        },
        {
          href: "/landlord/operations",
          label: "Mall and shop operations",
          description: "Manage active shop operations",
          allowed: can("operations"),
        },
        {
          href: "/landlord/rent",
          label: "Rent reconciliation",
          description: "Review manual rent records",
          allowed: can("finance"),
        },
      ],
    },
    {
      title: "Finance and exceptions",
      description: "Follow up on financial records and operational costs.",
      links: [
        {
          href: "/landlord/rent-exceptions",
          label: "Outstanding rent and corrections",
          description: "Resolve exceptions and discrepancies",
          allowed: can("finance"),
        },
        {
          href: "/landlord/costs",
          label: "Resources and costs",
          description: "Review reported operating costs",
          allowed: coreConfig().localAdapters && can("costs"),
        },
      ],
    },
    {
      title: "Trust, safety and support",
      description:
        "Resolve incidents, appeals and sensitive requests with the required permissions.",
      links: [
        {
          href: "/landlord/incidents",
          label: "Incidents and recovery",
          description: "Handle assigned incidents",
          allowed: canAny("recovery", "support", "moderation", "finance", "review"),
        },
        {
          href: "/landlord/trust",
          label: "Shop concerns and appeals",
          description: "Review moderation decisions",
          allowed: can("moderation"),
        },
        {
          href: "/landlord/privacy",
          label: "Privacy review",
          description: "Handle assigned privacy requests",
          allowed: can("privacy"),
        },
      ],
    },
    {
      title: "Growth and insights",
      description: "Understand mall activity and communicate with merchants.",
      links: [
        {
          href: "/landlord/analytics",
          label: "Pilot analytics",
          description: "Review available business signals",
          allowed: coreConfig().localAdapters && can("analytics"),
        },
        {
          href: "/landlord/communications",
          label: "Communications and promotions",
          description: "Manage approved messages and campaigns",
          allowed: can("operations"),
        },
      ],
    },
    {
      title: "Administration",
      description: "Configure services and manage your operator account.",
      links: [
        {
          href: "/landlord/services",
          label: "Service configuration",
          description: "Inspect configuration and warnings",
          allowed: can("operations"),
        },
        {
          href: "/landlord/demo-accounts",
          label: "Demonstration accounts",
          description: "Manage development accounts",
          allowed: coreConfig().localAdapters && can("operations"),
        },
        {
          href: "/security",
          label: "Account security",
          description: "Manage MFA and security settings",
          allowed: true,
        },
      ],
    },
  ];
  const queueCounts = await operatorQueueCounts(database(), can, canAny);
  const {
    applications: applicationCount,
    rentAttention: rentCount,
    incidents: incidentCount,
    trust: trustCount,
    privacy: privacyCount,
  } = queueCounts;
  const today = [
    {
      href: "/landlord/applications",
      label: "Applications",
      hint: "Review shop requests",
      allowed: can("review"),
      count: applicationCount,
    },
    {
      href: "/landlord/rent",
      label: "Rent desk",
      hint: "Due or grace tenancies",
      allowed: can("finance"),
      count: rentCount,
    },
    {
      href: "/landlord/incidents",
      label: "Incidents",
      hint: "Support and recovery cases",
      allowed: canAny("recovery", "support", "moderation", "finance", "review"),
      count: incidentCount,
    },
    {
      href: "/landlord/trust",
      label: "Trust queue",
      hint: "Concerns and appeals",
      allowed: can("moderation"),
      count: trustCount,
    },
    {
      href: "/landlord/privacy",
      label: "Privacy",
      hint: "Privacy requests",
      allowed: can("privacy"),
      count: privacyCount,
    },
  ].filter((item) => item.allowed);
  const navigation = groups.flatMap((group) =>
    group.links
      .filter((link) => link.allowed)
      .map((link) => ({ href: link.href, label: link.label, group: group.title })),
  );
  return (
    <PortalShell
      kind="landlord"
      title="Manage your mall with clarity."
      subtitle="Start with what needs attention, then open the tools for your next task."
      links={navigation}
      currentPath="/landlord"
      banner={
        today.length ? (
          <div className="portal-today" aria-label="Today’s work">
            <p className="portal-next-step__label">Today · quick access</p>
            <div className="portal-today__grid">
              {today.map((item) => (
                <Link key={item.href} href={item.href} className="portal-today__card">
                  <span className="workspace-queue-icon" aria-hidden="true">
                    <PortalIcon href={item.href} />
                  </span>
                  <strong>
                    {item.label}
                    {item.count !== null ? (
                      <span className="portal-today__count">{item.count}</span>
                    ) : null}
                  </strong>
                  <span>{item.hint}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null
      }
    >
      <WorkspaceWelcome
        eyebrow="The bigger picture"
        title="A good mall starts with great care."
        action={
          can("operations") ? (
            <Link className="button" href="/landlord/operations">
              Manage shops <Icon name="arrow" />
            </Link>
          ) : (
            <Link className="button" href="/security">
              Your account
            </Link>
          )
        }
      >
        A clear place for the people, shops and decisions that keep Londos moving.
      </WorkspaceWelcome>
      <section className="landlord-hub">
        <details className="landlord-account-details">
          <summary>Account protection &amp; background jobs</summary>
          <div className="landlord-status">
            <div>
              <strong>Protected workspace</strong>
              <span>Multi-factor authentication enabled</span>
            </div>
            <div>
              <strong>{grants.length} permissions</strong>
              <span>Scoped operator access</span>
            </div>
            {can("jobs") ? (
              <div>
                <strong>{counts.reduce((sum, item) => sum + item.count, 0)} jobs</strong>
                <span>Across all recorded states</span>
              </div>
            ) : null}
          </div>
          {can("jobs") && counts.length > 0 ? (
            <ul>
              {counts.map((item) => (
                <li key={item.state}>
                  {item.state}: {item.count}
                </li>
              ))}
            </ul>
          ) : null}
        </details>
        <div className="landlord-sections">
          {groups.map((group, index) => {
            const links = group.links.filter((link) => link.allowed);
            if (!links.length) return null;
            return (
              <section
                className="landlord-group"
                id={`management-${index}`}
                key={group.title}
                aria-labelledby={`management-heading-${index}`}
              >
                <div className="landlord-group-heading">
                  <h2 id={`management-heading-${index}`}>{group.title}</h2>
                  <p>{group.description}</p>
                </div>
                <div className="landlord-action-grid">
                  {links.map((link) => (
                    <WorkspaceTaskLink href={link.href} title={link.label} key={link.href}>
                      {link.description}
                    </WorkspaceTaskLink>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <p className="landlord-caution">
          Rent payments are reviewed and confirmed by your finance team.
        </p>
        <div className="landlord-signout">
          <SignOutButton />
        </div>
      </section>
    </PortalShell>
  );
}
