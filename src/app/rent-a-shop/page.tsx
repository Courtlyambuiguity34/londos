import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { coreConfigured } from "@/server/config";

export const metadata: Metadata = { title: "A place for your business" };

export default function RentShopPage() {
  const configured = coreConfigured();
  const applicationsOpen = configured;
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
          <h2>
            {applicationsOpen ? "Start your shop application." : "A place for your business."}
          </h2>
          <p>
            {applicationsOpen
              ? "Create an account, submit your business details for review, then follow your approved invoice and payment instructions. Your shop space is created after payment is verified. You decide when to publish your storefront."
              : configured
                ? "New shop applications are currently closed. Existing shopkeepers can sign in to manage their catalogue and publish updates."
                : "Merchant applications are unavailable in this read-only preview. It does not collect business information or accept rent payments."}
          </p>
        </div>
        <Link
          href={applicationsOpen ? "/register" : configured ? "/sign-in" : "/search"}
          className="button"
        >
          {applicationsOpen
            ? "Apply for a shop"
            : configured
              ? "Shopkeeper sign in"
              : "Explore a sample shop"}
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
          <summary>Where can I find my rent terms?</summary>
          <p>
            Your agreed rent terms and invoice determine the amount due. Browsing the mall does not
            create a subscription or a payment obligation.
          </p>
        </details>
      </section>
    </section>
  );
}
