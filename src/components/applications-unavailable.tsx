import Link from "next/link";

export function ApplicationsUnavailable() {
  return (
    <section className="shell page-section account-page">
      <h1>Shop applications</h1>
      <p>
        New shop applications are currently closed. Existing shopkeepers can continue managing their
        shops.
      </p>
      <Link className="button" href="/shopkeeper">
        Your shops
      </Link>
    </section>
  );
}
