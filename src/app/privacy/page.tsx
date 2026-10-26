import Link from "next/link";
import { PolicyContact } from "@/components/policy-contact";
export const metadata = { title: "Privacy policy" };
export default function Page() {
  return (
    <article className="shell page-section prose-page policy-page">
      <p className="eyebrow">Your information</p>
      <h1>Privacy policy</h1>
      <p>Effective 26 October 2026</p>
      <p>
        This policy explains how Londos handles information when you browse shops, create an account
        or use a private workspace. Individual merchants are responsible for information you share
        with them outside Londos.
      </p>
      <h2>What we collect and why</h2>
      <ul>
        <li>
          Account name, email, password hash and security records let us verify your email, sign you
          in, protect accounts and recover access.
        </li>
        <li>
          Shop profiles, catalogue content and contact details you publish are visible to visitors
          and may appear in search engines.
        </li>
        <li>
          Enquiry messages and reply details are shared with the relevant merchant so they can
          respond.
        </li>
        <li>
          Applications, rent references, reports and privacy requests support account review, manual
          payment checks and safety. Private evidence is restricted to authorised reviewers.
        </li>
        <li>
          Session cookies, technical records and security logs help operate and protect the service.
          Installing the app does not change these purposes.
        </li>
      </ul>
      <h2>Who receives information</h2>
      <p>
        We use hosting, database and email providers to run Londos. When configured, media providers
        store shop images and AI providers process material you choose to submit through AI
        features. Provider processing may take place outside your country. Do not send sensitive
        personal information to an AI tool or publish it in a catalogue.
      </p>
      <p>
        Merchants receive their own enquiries. Authorised Londos operators access records needed for
        their assigned work. We do not publish private report attachments or account credentials.
      </p>
      <h2>Retention and your choices</h2>
      <p>
        We retain information while needed to provide the service, resolve disputes, protect
        accounts or meet applicable recordkeeping duties. A shop closure does not automatically
        delete its records. Backup copies and records held by third parties may remain after a
        change in the main database.
      </p>
      <p>
        You may request access, correction or deletion of your information. We may need to verify
        your identity and explain records that must be retained. Shop owners can download available
        business records and submit requests from their privacy workspace. Requests are reviewed by
        a person; submitting a request does not automatically erase data.
      </p>
      <h2>Cookies and external services</h2>
      <p>
        Saved shops is an optional feature stored on your browser. It stores only shop identifiers,
        up to 40, and checks their current public details when you open your saved list. It does not
        synchronise across devices. Use Clear saved shops or clear this browser's site data to
        remove the list. No account is needed, and saving a shop does not subscribe you to emails.
      </p>
      <p>
        Essential cookies support sign-in and account security. WhatsApp, merchant websites and
        other external links have their own privacy terms. We do not require an account for ordinary
        browsing.
      </p>
      <h2>Contact and updates</h2>
      <PolicyContact />
      <p>
        We publish changes here with a revised effective date. Review this policy before sharing
        information or submitting an application.
      </p>
      <div className="button-row">
        <Link href="/terms">Terms of use</Link>
        <Link href="/about">How Londos works</Link>
        <Link href="/register">Back to registration</Link>
      </div>
    </article>
  );
}
