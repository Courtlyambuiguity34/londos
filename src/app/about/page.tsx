import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/icon";
import { previewCapabilities } from "@/server/preview";

export const metadata: Metadata = { title: "A mall built around the shop" };

export default function AboutPage() {
  const hosted = previewCapabilities().mode === "database-core";
  return (
    <div className="shell page-section about-page">
      <section className="about-hero">
        <div>
          <p className="eyebrow">A place for independent business</p>
          <h1>
            A shared destination.
            <br />
            <em>A world of their own.</em>
          </h1>
          <p>
            In a good mall, you don’t just find a product. You find a shop, the person behind it,
            and a reason to come back.
          </p>
          <p>
            Londos brings that feeling online. Businesses rent their own digital premises, shape
            their identity, and benefit from a shared place for discovery.
          </p>
          <Link href="/search" className="button">
            Take a look around <Icon name="arrow" />
          </Link>
        </div>
        <Image
          src="/illustrations/mall.svg"
          alt="Independent shops surrounding a shared courtyard"
          width={740}
          height={650}
        />
      </section>
      <div className="principle-grid">
        {[
          {
            title: "The shop comes first.",
            text: "Products belong to businesses with their own identity. Search helps you find a shop, then explore its whole collection.",
          },
          {
            title: "An open door.",
            text: "You can enter, browse and discover without creating an account. Getting to know a business should feel easy.",
          },
          {
            title: "Their business. Their terms.",
            text: "Merchants choose approved ways to connect, arrange delivery and do business with their customers.",
          },
        ].map((principle) => (
          <article key={principle.title}>
            <h2>{principle.title}</h2>
            <p>{principle.text}</p>
          </article>
        ))}
      </div>
      <section className="how-to-use" aria-labelledby="how-londos-works">
        <p className="eyebrow">Find it. Explore it. Make a connection.</p>
        <h2 id="how-londos-works">How to use Londos</h2>
        <ol className="how-to-steps">
          <li>
            <h3>Find a shop</h3>
            <p>
              Search for a product, service or shop name, or choose a category. You don’t need an
              account to browse.
            </p>
          </li>
          <li>
            <h3>Explore their collection</h3>
            <p>
              Open a shop to see its departments, products, prices and contact options. Share its
              page link on WhatsApp so someone else can find it.
            </p>
          </li>
          <li>
            <h3>Talk to the merchant</h3>
            <p>
              Use the contact options the shop offers. Agree on availability, delivery and payment
              before buying.
            </p>
          </li>
        </ol>
        <div className="button-row">
          <Link className="button" href="/search">
            Explore shops
          </Link>
          <Link className="button button--outline" href="/install">
            Add Londos to your device
          </Link>
        </div>
      </section>
      <div className="notice">
        <strong>{hosted ? "Buying from a shop" : "About this preview"}</strong>
        <p>
          {hosted
            ? "Contact the merchant to agree on availability, payment and delivery. Londos does not collect payment for purchases from shops. An enquiry receipt does not confirm a purchase."
            : "This development mall uses fictional shops, products and prices. Londos does not collect payments here. Where a shop enables enquiries, a receipt does not confirm a purchase."}
        </p>
      </div>
      <section id="report" className="notice">
        <h2>Report a concern</h2>
        <p>
          Merchant enquiries go to the shop, not to Londos management. Read our reporting
          information before sharing a platform concern. Never include passwords or payment
          credentials in a message.
        </p>
        <Link href="/report">How to report a shop concern</Link>
      </section>
      <nav className="button-row" aria-label="Londos policies">
        <Link href="/terms">Terms of use</Link>
        <Link href="/privacy">Privacy policy</Link>
      </nav>
    </div>
  );
}
