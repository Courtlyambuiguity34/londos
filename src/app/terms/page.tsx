import Link from "next/link";
import { PolicyContact } from "@/components/policy-contact";
export const metadata = { title: "Terms of use" };
export default function Page() {
  return (
    <article className="shell page-section prose-page policy-page">
      <p className="eyebrow">Using the mall</p>
      <h1>Terms of use</h1>
      <p>Effective 21 October 2026</p>
      <h2>What Londos provides</h2>
      <p>
        Londos helps people discover independent shops and contact merchants. Browsing is open to
        everyone. A merchant account and shop approval are separate: registering does not grant a
        shop, landlord access or permission to act for another business.
      </p>
      <h2>Your account and content</h2>
      <p>
        Provide accurate information, use only content you have the right to share, keep passwords
        and verification codes private, and notify Londos about suspected misuse. Do not impersonate
        others, access another shop’s private records, send spam, publish unlawful goods or content,
        or attempt to bypass security controls.
      </p>
      <h2>Buying from merchants</h2>
      <p>
        Confirm availability, price, payment, delivery, returns and any warranty with the merchant
        before paying. Merchants are responsible for their products and fulfilment. An enquiry,
        listing or review is not a guarantee, confirmed order or proof of payment. Londos does not
        collect payment for purchases from shops.
      </p>
      <h2>Shop rent and renewal</h2>
      <p>
        Your agreed rental terms and invoice state the amount and period due. Follow the payment
        instructions in your authenticated workspace. Where payment is manual, submit the reference
        for review; a claim does not confirm payment until an authorised operator reconciles it. Do
        not send passwords or banking credentials. Discounts apply only under their stated
        conditions.
      </p>
      <h2>Safety and availability</h2>
      <p>
        Londos may restrict content or access to protect users, enforce these terms or respond to a
        verified concern. Shop owners can use the available review and appeal process. Access may be
        interrupted by maintenance or technical faults; retain your own business records. Nothing
        here removes rights you have under applicable law.
      </p>
      <h2>Privacy and contacting Londos</h2>
      <p>
        Read the <Link href="/privacy">Privacy policy</Link> before providing personal information.
        Use the reporting tools for shop concerns; they are not an emergency service.
      </p>
      <PolicyContact />
      <div className="button-row">
        <Link href="/about">How Londos works</Link>
        <Link href="/register">Back to registration</Link>
      </div>
    </article>
  );
}
