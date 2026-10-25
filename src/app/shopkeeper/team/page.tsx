import Link from "next/link";
import { AccountWorkspaceShell } from "@/components/account-workspace-shell";
import { notFound } from "next/navigation";
import { z } from "zod";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { ownedMerchants } from "@/server/team";
export const metadata = { title: "Your merchant teams" };
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    parsed = z.coerce
      .number()
      .int()
      .min(0)
      .max(500)
      .safeParse((await searchParams).page ?? 0);
  if (!parsed.success) notFound();
  const page = parsed.data,
    merchants = await ownedMerchants(database(), actor, page);
  return (
    <AccountWorkspaceShell
      kind="shopkeeper"
      title="Merchant teams"
      subtitle="Manage the teams and businesses you own."
      currentPath="/shopkeeper/team"
    >
      <section className="portal-section account-page">
        <p>Owners manage team membership and shop permissions with recent authentication.</p>
        <ul className="workspace-list">
          {merchants.map((m) => (
            <li key={m.id}>
              <Link href={`/shopkeeper/merchants/${m.id}/team`}>{m.name}</Link>
            </li>
          ))}
        </ul>
        {!merchants.length ? <p>No owned merchant accounts are available on this page.</p> : null}
        <div className="account-links">
          {page > 0 ? <Link href={`?page=${page - 1}`}>Previous page</Link> : null}
          {merchants.length === 20 && page < 500 ? (
            <Link href={`?page=${page + 1}`}>Next page</Link>
          ) : null}
          <Link href="/shopkeeper">Your shops</Link>
        </div>
      </section>
    </AccountWorkspaceShell>
  );
}
