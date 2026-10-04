import Link from "next/link";
import { RecoveryForm } from "@/components/auth-controls";
import { coreConfigured } from "@/server/config";
export const metadata = { title: "Account recovery" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token;
  return (
    <section className="shell page-section account-page">
      <h1>Recover your account.</h1>
      {coreConfigured() ? (
        <RecoveryForm {...(token ? { token } : {})} />
      ) : (
        <p>Account services are not configured.</p>
      )}
      <Link className="text-button" href="/sign-in">
        Return to sign-in
      </Link>
    </section>
  );
}
