import Link from "next/link";
import { SignInForm } from "@/components/auth-controls";
import { coreConfigured } from "@/server/config";
export const metadata = { title: "Sign in" };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = (await searchParams).next;
  const destination = next === "/landlord" || next === "/security" ? next : "/shopkeeper";
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Private workspace</p>
      <h1>Welcome back.</h1>
      <p>
        Customers can browse the mall without an account. This sign-in is for shop staff and
        operators.
      </p>
      {coreConfigured() ? (
        <SignInForm destination={destination} />
      ) : (
        <p>Account services are not configured in this public preview.</p>
      )}
      <Link className="text-button" href="/recover">
        Recover your account
      </Link>
      <Link className="text-button" href="/register">
        Create a verified shopkeeper account
      </Link>
    </section>
  );
}
