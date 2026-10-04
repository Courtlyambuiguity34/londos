import Link from "next/link";
import { MfaControls, SignOutButton } from "@/components/auth-controls";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { sessionState } from "@/server/security/authorization";
export const metadata = { title: "Account security" };
export default async function Page() {
  if (!coreConfigured())
    return (
      <section className="shell page-section">
        <h1>Account security</h1>
        <p>Account services are not configured.</p>
      </section>
    );
  const actor = await pageActor("/security"),
    session = await sessionState(database(), actor, true);
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Private account</p>
      <h1>Account security.</h1>
      <p>{session.email}</p>
      <MfaControls enabled={session.mfa_enabled} />
      <p>
        For fresh password authentication, sign out and sign in again. Operators must retain MFA.
        Recovery uses single-use backup codes during sign-in.
      </p>
      <nav className="account-links" aria-label="Private workspaces">
        <Link className="button" href="/shopkeeper">
          Shopkeeper
        </Link>
        <Link className="button button-secondary" href="/landlord">
          Landlord
        </Link>
        <SignOutButton />
      </nav>
    </section>
  );
}
