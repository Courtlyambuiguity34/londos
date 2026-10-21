import Link from "next/link";
import { previewCapabilities } from "@/server/preview";
export const metadata = { title: "Report a concern" };
export default function Page() {
  const mode = previewCapabilities().mode;
  return (
    <section className="shell page-section account-page">
      <h1>Report a concern</h1>
      <p>
        {mode !== "fixture-preview"
          ? "Open a shop and choose “Report a concern about this shop”. Your report goes privately to authorised Londos reviewers. Save the reference shown after submitting."
          : "Online concern reporting is currently unavailable. Merchant enquiries go to the shop and do not reach Londos management."}
      </p>
      <p>
        Londos is not an emergency service. For an urgent threat, contact the appropriate local
        emergency services. Never share passwords or payment credentials in a report.
      </p>
      <Link className="button" href="/">
        Browse the mall
      </Link>
    </section>
  );
}
