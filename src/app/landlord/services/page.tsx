import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { AccessError } from "@/server/security/errors";
import { readServiceConfiguration } from "@/server/services/status";
export const metadata = { title: "Service configuration" };
export default async function Page() {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord");
  let view;
  try {
    view = await readServiceConfiguration(database(), actor);
  } catch (error) {
    if (error instanceof AccessError) {
      if (["fresh_authentication_required", "mfa_required"].includes(error.code))
        redirect("/security");
      notFound();
    }
    throw error;
  }
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Operations · recent MFA required</p>
      <h1>Service configuration</h1>
      <p>
        Warnings identify setup work. Configured services still need a connection check; this page
        makes no external requests.
      </p>
      <ul className="workspace-list">
        {view.services.map((s) => (
          <li key={s.name}>
            <strong>
              {s.name}: {s.status}
            </strong>
            <p>{s.message}</p>
          </li>
        ))}
      </ul>
      <p>
        PostgreSQL holds account, tenancy, subscription, job and audit authority. Redis is optional.
      </p>
      <div className="account-links">
        <Link href="/security">Account security</Link>
        <Link href="/landlord">Landlord</Link>
      </div>
    </section>
  );
}
