import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/icon";

export const metadata: Metadata = { title: "A mall built around the shop" };

export default function AboutPage() {
  return (
    <div className="shell page-section">
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
      <div className="notice">
        <strong>About this preview</strong>
        <p>
          This development mall uses fictional shops, products and prices. Londos does not collect
          payments here. Where a shop enables enquiries, a receipt does not confirm a purchase.
        </p>
      </div>
      <section id="report" className="notice">
        <h2>Report a concern</h2>
        <p>
          Public support and moderation reporting are being prepared. Do not send sensitive
          information to a merchant enquiry when reporting a platform problem. No live report
          delivery is available in this development mall.
        </p>
      </section>
    </div>
  );
}
