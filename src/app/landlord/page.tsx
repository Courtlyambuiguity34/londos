import type { Metadata } from "next";
import { WorkspaceGateway } from "@/components/workspace-gateway";
import Link from "next/link";
import { PortalShell } from "@/components/portal-shell";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { sessionState } from "@/server/security/authorization";
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
  if (!grants.length)
    return (
      <section className="shell page-section">
        <h1>Operator access is unavailable.</h1>
        <p>Your current account has no operator permissions.</p>
        <Link href="/shopkeeper" className="button">
          Shopkeeper
        </Link>
      </section>
    );
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
        { href: "/landlord/applications", label: "Review applications", description: "Assess shop applications", allowed: can("review") },
        { href: "/landlord/operations", label: "Mall and shop operations", description: "Manage active shop operations", allowed: can("operations") },
        { href: "/landlord/rent", label: "Rent reconciliation", description: "Review manual rent records", allowed: can("finance") },
      ],
    },
    {
      title: "Finance and exceptions",
      description: "Follow up on financial records and operational costs.",
      links: [
        { href: "/landlord/rent-exceptions", label: "Outstanding rent and corrections", description: "Resolve exceptions and discrepancies", allowed: can("finance") },
        { href: "/landlord/costs", label: "Resources and costs", description: "Review reported operating costs", allowed: can("costs") },
      ],
    },
    {
      title: "Trust, safety and support",
      description: "Resolve incidents, appeals and sensitive requests with the required permissions.",
      links: [
        { href: "/landlord/incidents", label: "Incidents and recovery", description: "Handle assigned incidents", allowed: canAny("recovery", "support", "moderation", "finance", "review") },
        { href: "/landlord/trust", label: "Shop concerns and appeals", description: "Review moderation decisions", allowed: can("moderation") },
        { href: "/landlord/privacy", label: "Privacy review", description: "Handle assigned privacy requests", allowed: can("privacy") },
      ],
    },
    {
      title: "Growth and insights",
      description: "Understand mall activity and communicate with merchants.",
      links: [
        { href: "/landlord/analytics", label: "Pilot analytics", description: "Review available business signals", allowed: can("analytics") },
        { href: "/landlord/communications", label: "Communications and promotions", description: "Manage approved messages and campaigns", allowed: can("operations") },
      ],
    },
    {
      title: "Administration",
      description: "Configure services and manage your operator account.",
      links: [
        { href: "/landlord/services", label: "Service configuration", description: "Inspect configuration and warnings", allowed: can("operations") },
        { href: "/landlord/demo-accounts", label: "Demonstration accounts", description: "Manage development accounts", allowed: can("operations") },
        { href: "/security", label: "Account security", description: "Manage MFA and security settings", allowed: true },
      ],
    },
  ];
  const navigation = groups.flatMap((group) => group.links.filter((link) => link.allowed).map((link) => ({ href: link.href, label: link.label })));
  return (
    <PortalShell kind="landlord" title="Manage your mall with clarity." subtitle="Shops, tenants, finance, support and growth — organized around your work." links={navigation}>
    <section className="landlord-hub">
      <p className="eyebrow">Londos · secure management workspace</p>

      <p className="landlord-intro">
        Start with shops and tenants, then handle rent, support and growth. Your tools are
        grouped by responsibility, and only actions permitted for your account are shown.
      </p>
      <div className="landlord-status" role="status">
        <div><strong>Protected workspace</strong><span>Multi-factor authentication enabled</span></div>
        <div><strong>{grants.length} permissions</strong><span>Scoped operator access</span></div>
        {can("jobs") ? <div><strong>{counts.reduce((sum, item) => sum + item.count, 0)} jobs</strong><span>Across all recorded states</span></div> : null}
      </div>
      <nav className="landlord-jump" aria-label="Management sections">
        {groups.filter((group) => group.links.some((link) => link.allowed)).map((group, index) => (
          <a key={group.title} href={`#management-${index}`}>{group.title}</a>
        ))}
      </nav>
      <div className="landlord-sections">
        {groups.map((group, index) => {
          const links = group.links.filter((link) => link.allowed);
          if (!links.length) return null;
          return (
            <section className="landlord-group" id={`management-${index}`} key={group.title} aria-labelledby={`management-heading-${index}`}>
              <div className="landlord-group-heading">
                <h2 id={`management-heading-${index}`}>{group.title}</h2>
                <p>{group.description}</p>
              </div>
              <div className="landlord-action-grid">
                {links.map((link) => (
                  <Link className="landlord-action" href={link.href} key={link.href}>
                    <strong>{link.label}</strong>
                    <span>{link.description}</span>
                    <span className="landlord-action-arrow" aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {can("jobs") && counts.length > 0 ? (
        <details className="landlord-jobs">
          <summary>Background job details</summary>
          <ul>{counts.map((item) => <li key={item.state}>{item.state}: {item.count}</li>)}</ul>
        </details>
      ) : null}
      <p className="landlord-caution">Rent reconciliation is manual. Live collection is not enabled.</p>
      <div className="landlord-signout"><SignOutButton /></div>
    </section>
    </PortalShell>
  );
}
