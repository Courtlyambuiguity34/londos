import Link from "next/link";
import { notFound } from "next/navigation";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { readDemoAccounts } from "@/server/demo-accounts";
import { RetireDemoForm } from "@/components/demo-account-controls";
export const metadata = { title: "Demonstration accounts" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ after?: string }>;
}) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    view = await readDemoAccounts(database(), actor, (await searchParams).after ?? null);
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Fictional development cohort</p>
      <h1>Demonstration accounts</h1>
      <p>
        These accounts are for trying the merchant workflow. They do not represent real pilot
        recruitment or paid renewals.
      </p>
      <p>
        Removal revokes sign-in and membership access and hides this merchant’s shops. Existing
        business and audit records remain available to authorized operators.
      </p>
      <ul className="workspace-list">
        {view.accounts.map((a) => (
          <li key={a.user_id}>
            <strong>{a.label}</strong>
            <span>{a.shop_name}</span>
            {a.retired_at ? (
              <span>Removed</span>
            ) : (
              <RetireDemoForm userId={a.user_id} version={a.version} />
            )}
          </li>
        ))}
      </ul>
      {!view.accounts.length ? <p>No demonstration accounts on this page.</p> : null}
      <div className="account-links">
        {view.nextAfter ? (
          <Link href={`?after=${encodeURIComponent(view.nextAfter)}`}>Next page</Link>
        ) : null}
        <Link href="/landlord/demo-accounts">First page</Link>
        <Link href="/security">Account security</Link>
        <Link href="/landlord">Landlord</Link>
      </div>
    </section>
  );
}
