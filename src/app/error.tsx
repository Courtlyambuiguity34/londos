"use client";

import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="shell page-section empty-state" role="alert">
      <h1>We couldn't complete that request.</h1>
      <p>Try again. If the problem continues, contact Londos support and include the error reference below.</p>
      {error.digest ? (
        <p className="error-reference">Error reference: <code>{error.digest}</code></p>
      ) : null}
      <div className="error-actions">
        <button type="button" className="button" onClick={reset}>
          Try again
        </button>
        <Link href="/landlord" className="button button--outline">
          Management home
        </Link>
        <Link href="/shopkeeper" className="button button--outline">
          Shopkeeper home
        </Link>
        <Link href="/" className="button button--outline">
          Return to the mall
        </Link>
      </div>
    </section>
  );
}
