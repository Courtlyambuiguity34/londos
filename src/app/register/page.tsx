import Link from "next/link";
import { RegistrationForm } from "@/components/auth-controls";
import { coreConfigured } from "@/server/config";

export const metadata = { title: "Create a shopkeeper account" };

export default function RegisterPage() {
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Shopkeeper registration</p>
      <h1>Create your Londos account safely.</h1>
      <p>
        Verify your email before signing in. Registration never creates landlord or operator access;
        shop approval remains a separate reviewed process.
      </p>
      {coreConfigured() ? (
        <RegistrationForm />
      ) : (
        <p>Account registration is not configured in this public preview.</p>
      )}
      <Link className="text-button" href="/sign-in">
        Already registered? Sign in
      </Link>
    </section>
  );
}
