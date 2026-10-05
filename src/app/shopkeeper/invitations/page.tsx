import Link from "next/link";
import { notFound } from "next/navigation";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { AcceptInvitationForm } from "@/components/admin-controls";
export const metadata = { title: "Accept a merchant invitation" };
export default async function Page() {
  if (!coreConfigured()) notFound();
  await pageActor("/shopkeeper");
  return (
    <section className="shell page-section account-page">
      <h1>Accept a merchant invitation</h1>
      <p>
        Sign in using the invited email, then enter the token from your private invitation.
        Development invitations are delivered to the local private notification sink. An invitation
        expires after 48 hours and can be accepted once.
      </p>
      <AcceptInvitationForm />
      <Link href="/shopkeeper">Your shops</Link>
    </section>
  );
}
