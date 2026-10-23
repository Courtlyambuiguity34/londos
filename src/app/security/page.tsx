import Link from "next/link";
import { MfaControls, SignOutButton } from "@/components/auth-controls";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { sessionState } from "@/server/security/authorization";
import { workspaceAccess } from "@/server/navigation";
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
    session = await sessionState(database(), actor, true),
    access=await workspaceAccess();
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
        {access.shopkeeper ? <Link className="button" href="/shopkeeper">Shopkeeper workspace</Link> : null}
        {access.landlord ? <Link className="button button-secondary" href="/landlord">Mall management</Link> : null}
        {!access.shopkeeper && !access.landlord ? <p>Your account has no active shop membership or operator grant. You can apply for a shop from the public mall.</p> : null}
        <SignOutButton />
      </nav>
    </section>
  );
}
