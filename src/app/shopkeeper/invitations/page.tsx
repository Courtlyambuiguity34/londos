import Link from "next/link";
import { AccountWorkspaceShell } from "@/components/account-workspace-shell";
import { notFound } from "next/navigation";
import { coreConfigured } from "@/server/config";
import { AcceptInvitationForm } from "@/components/admin-controls";
import { headers } from "next/headers";
import { auth } from "@/server/security/auth";
import { resolveActor, sessionState } from "@/server/security/authorization";
import { AccessError } from "@/server/security/errors";
import { database } from "@/server/db/pool";
export const metadata = { title: "Accept a merchant invitation" };
export default async function Page() {
  if (!coreConfigured()) notFound();
  let authenticated = false;
  try {
    const actor = await resolveActor(auth(), await headers());
    await sessionState(database(), actor, true);
    authenticated = true;
  } catch (error) {
    if (!(error instanceof AccessError) || error.status !== 401) throw error;
  }
  // No invitation token is read on the server or included in rendered props.
  // The anonymous shell carries no merchant, invitation or membership data.
  const content = (
    <section className="portal-section account-page">
      <h1>Accept a merchant invitation</h1>
      <p>
        Open the private invitation from the shop owner. Sign in using the email address that was
        invited, then accept only if you recognise the invitation.
      </p>
      <AcceptInvitationForm authenticated={authenticated} />
      {authenticated ? <Link href="/shopkeeper">Your shops</Link> : null}
    </section>
  );
  return authenticated ? (
    <AccountWorkspaceShell
      kind="shopkeeper"
      title="Invitations"
      subtitle="Join an existing merchant team."
      currentPath="/shopkeeper/invitations"
    >
      {content}
    </AccountWorkspaceShell>
  ) : (
    <div className="shell page-section">{content}</div>
  );
}
