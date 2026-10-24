import Link from "next/link";
import { AccountWorkspaceShell } from "@/components/account-workspace-shell";
import { notFound } from "next/navigation";
import { z } from "zod";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { mallOccupancy, operationsQueue } from "@/server/administration";
import { ClaimOperationsForm } from "@/components/admin-controls";
export const metadata = { title: "Mall and shop operations" };
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    page = z.coerce
      .number()
      .int()
      .min(0)
      .max(500)
      .parse((await searchParams).page ?? 0),
    malls = await mallOccupancy(database(), actor, page),
    shops = await operationsQueue(database(), actor, page);
  return (
    <AccountWorkspaceShell kind="landlord" title="Mall and shop operations" subtitle="Review occupancy and scoped shop operations." currentPath="/landlord/operations"><section className="portal-section account-page">
      <h1>Mall and shop operations</h1>
      <p>
        Planning occupancy counts all assigned shops. Claim a scoped investigation before reading
        details or changing public access.
      </p>
      <h2>Internal mall occupancy</h2>
      <ul className="workspace-list">
        {malls.map((m) => (
          <li key={m.id}>
            <strong>{m.name}</strong>
            <span>
              {m.occupied} / {m.planning_capacity} shops · {m.published} published
            </span>
            <span>
              {m.occupied >= m.planning_capacity
                ? "Planning capacity reached"
                : m.occupied * 10 >= m.planning_capacity * 9
                  ? "Approaching planning capacity"
                  : "Capacity available"}
            </span>
          </li>
        ))}
      </ul>
      <h2>Shop operations queue</h2>
      <ul className="workspace-list">
        {shops.map((s) => (
          <li key={s.id}>
            <strong>{s.name}</strong>
            <span>
              Tenancy: {s.tenancy} · administrative access: {s.paused ? "paused" : "clear"}
            </span>
            {s.claimed ? (
              <Link href={`/landlord/operations/${s.id}`}>Open scoped shop operations</Link>
            ) : (
              <ClaimOperationsForm shopId={s.id} />
            )}
          </li>
        ))}
      </ul>
      <div className="account-links">
        {page > 0 ? <Link href={`?page=${page - 1}`}>Previous page</Link> : null}
        {(malls.length === 20 || shops.length === 20) && page < 500 ? (
          <Link href={`?page=${page + 1}`}>Next page</Link>
        ) : null}
        <Link href="/landlord">Landlord</Link>
      </div>
    </section></AccountWorkspaceShell>
  );
}
