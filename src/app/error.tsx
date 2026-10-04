"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="shell page-section empty-state" role="alert">
      <h1>A little pause in your visit.</h1>
      <p>We couldn’t load this page. Please try again or return to the mall.</p>
      <div className="error-actions">
        <button type="button" className="button" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="button button--outline">
          Return to the mall
        </Link>
      </div>
    </section>
  );
}
