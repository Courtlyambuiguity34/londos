import type { Metadata } from "next";
import Link from "next/link";
import { previewCapabilities } from "@/server/preview";

export const metadata: Metadata = { title: "Shopping help" };

export default function ShoppingHelpPage() {
  const sample = previewCapabilities().mode !== "database-core";
  return (
    <div className="shell page-section shopping-help">
      <div className="page-heading">
        <p className="eyebrow">A little help, before you buy</p>
        <h1>
          Find it. Ask about it.
          <br />
          <em>Know what comes next.</em>
        </h1>
        <p>Discover independent shops and speak directly with the people behind them.</p>
      </div>
      {sample ? (
        <p className="notice">
          This preview uses fictional shops, products and prices. Purchases are unavailable here.
        </p>
      ) : null}
      <ol className="how-to-steps">
        <li>
          <h2>Find your match</h2>
          <p>
            Search for a shop, product or service. In the live mall, refine by category, listing
            type, availability or budget. Open a result to explore the shop.
          </p>
        </li>
        <li>
          <h2>Check the details</h2>
          <p>
            Read the listing and the shop’s collection, delivery and payment information. Ask about
            current stock, the full price and return terms.
          </p>
        </li>
        <li>
          <h2>Talk to the shop</h2>
          <p>
            Use its available contact options to agree on the purchase. The merchant confirms your
            arrangements directly.
          </p>
        </li>
      </ol>
      <section aria-labelledby="shopping-questions" className="shopping-questions">
        <h2 id="shopping-questions">Your shopping questions</h2>
        <details>
          <summary>How can I compare products?</summary>
          <p>
            In the live mall, choose “Add to comparison” on up to four listings, then open{" "}
            <Link href="/compare">Compare products</Link>. Selections are stored in this browser.
            The comparison reads current public listings; items can change or become unavailable.
            Prices in different currencies are shown without conversion. A comparison link can be
            shared and read without signing in.
          </p>
        </details>
        <details>
          <summary>Do I need an account to browse?</summary>
          <p>
            No. You can explore shops and listings without signing in. Merchant workspaces require
            an account.
          </p>
        </details>
        <details>
          <summary>How do budget filters work?</summary>
          <p>
            Choose a currency and enter a minimum, maximum, or both. Amounts include the endpoints.
            Use whole amounts for UGX and up to two decimal places for other currencies, without
            commas. Results show shops with a matching listing, and its advertised price. Listings
            marked “Ask for price” are excluded while a budget is active. Delivery costs may be
            additional; confirm the total with the shop.
          </p>
        </details>
        <details>
          <summary>Can I pay or place an order through Londos?</summary>
          <p>
            Londos does not collect payment for purchases from shops. Contact the merchant using the
            options on its page. A contact action or enquiry receipt does not confirm stock, a sale
            or a delivery booking.
          </p>
        </details>
        <details>
          <summary>Does a shop deliver, or can I collect?</summary>
          <p>
            Look for “Collection & delivery” in the shop’s contact information. These details are
            supplied by the merchant. Confirm its service area, any charges, the collection point
            and timing before paying.
          </p>
        </details>
        <details>
          <summary>What if I need a return or refund?</summary>
          <p>
            Ask the merchant for its applicable return and refund terms before buying. For a
            purchase question, contact the shop directly. For a concern about a shop on Londos, use{" "}
            <Link href="/report">Report a shop concern</Link>.
          </p>
        </details>
        <details>
          <summary>Where are my saved shops?</summary>
          <p>
            Open <Link href="/saved">Saved shops</Link>. They are stored in this browser on this
            device, without an account, and do not sync between devices. Clearing browser storage
            can remove them. You can save up to 40 shops.
          </p>
        </details>
        <details>
          <summary>Why can’t I find a shop or listing anymore?</summary>
          <p>
            Shops and listings can change or become unavailable. Search again or contact the
            merchant through a contact method you already have. A saved link does not guarantee that
            a shop is still open.
          </p>
        </details>
        <details>
          <summary>Can I use Londos as an app?</summary>
          <p>
            See <Link href="/install">Install Londos</Link> for the options on your device. You can
            also continue in your browser.
          </p>
        </details>
      </section>
      <div className="button-row">
        <Link className="button" href="/search">
          Explore shops
        </Link>
        <Link className="button button--outline" href="/rent-a-shop">
          Open your own shop
        </Link>
      </div>
    </div>
  );
}
