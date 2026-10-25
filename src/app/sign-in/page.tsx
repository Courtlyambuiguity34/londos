import Link from "next/link";
import Image from "next/image";
import { SignInForm } from "@/components/auth-controls";
import { coreConfigured } from "@/server/config";
export const metadata = { title: "Sign in" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const destination =
    next === "/landlord" || next === "/security" || next === "/shopkeeper/invitations"
      ? next
      : "/shopkeeper";
  return (
    <section className="shell page-section account-page sign-in-page">
      <Image
        src="/brand/londos-logo.png"
        width={300}
        height={100}
        alt="Londos"
        className="sign-in-logo"
        unoptimized
      />
      <p className="eyebrow">
        {destination === "/landlord" ? "Londos Management" : "Your shop workspace"} · Restricted
        access
      </p>
      <h1>Welcome back.</h1>
      <p>
        {destination === "/landlord"
          ? "Sign in with your authorised management account. We’ll ask for your authenticator code before you enter the landlord workspace."
          : "Sign in to manage your shops, update products and connect with customers. Your account gives you access only to your assigned shops."}
      </p>
      {coreConfigured() ? (
        <>
          {error ? (
            <p role="alert">
              This verification link could not be used. It may have expired. Request a fresh
              verification email below, then open the newest link.
            </p>
          ) : null}
          <SignInForm destination={destination} />
        </>
      ) : (
        <p>Account services are not configured in this public preview.</p>
      )}
      <Link className="text-button" href="/recover">
        Recover your account
      </Link>
      {destination !== "/landlord" ? (
        <Link className="text-button" href="/register">
          Create a verified shopkeeper account
        </Link>
      ) : null}
      <Link className="text-button" href="/">
        Just browsing? Return to the mall
      </Link>
    </section>
  );
}
