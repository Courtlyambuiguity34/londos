import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";

export const metadata: Metadata = { title: "A place for your business" };

export default function RentShopPage() {
  return (
    <section className="shell page-section">
      <div className="merchant-page-heading">
        <p className="eyebrow">Your next chapter starts with a shop</p>
        <h1>
          Your name on the door.
          <br />
          <em>Your place in Londos.</em>
        </h1>
        <p>
          Rent digital shop space in a shared destination. Build around your identity, bring your
          catalogue, and let more people discover what makes your business yours.
        </p>
      </div>
      <div className="principle-grid">
        {[
          {
            title: "A shop of your own",
            text: "Your branding, departments and collections, arranged in your own safe, mobile-friendly surroundings.",
          },
          {
            title: "A place to be discovered",
            text: "Customers can find your shop through what you sell, then browse the rest of your business.",
          },
          {
            title: "Your way to connect",
            text: "Choose approved contact, payment and delivery arrangements that work for your business.",
          },
        ].map((item) => (
          <article key={item.title}>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
      <div className="application-preview">
        <div>
          <p className="eyebrow">A careful start</p>
          <h2>We’re preparing the first shops.</h2>
          <p>
            Merchant applications are unavailable in this read-only preview. It does not collect
            business information or accept rent payments. Rent and space allowances will be
            confirmed for the pilot.
          </p>
        </div>
        <Link href="/search" className="button">
          Explore a sample shop
          <Icon name="arrow" />
        </Link>
      </div>
      <section className="faq">
        <h2>A few things to know</h2>
        <details>
          <summary>Will my customers need a Londos account?</summary>
          <p>
            No. Ordinary browsing, search and approved contact methods will be available without a
            customer account.
          </p>
        </details>
        <details>
          <summary>Who controls my products and business terms?</summary>
          <p>
            You manage your catalogue, contact methods and delivery/payment arrangements within the
            mall’s safety and operating rules.
          </p>
        </details>
        <details>
          <summary>Is rent already fixed?</summary>
          <p>
            No. Pilot pricing and included resource allowances still need to be confirmed. This
            preview makes no permanent pricing promise.
          </p>
        </details>
      </section>
    </section>
  );
}
