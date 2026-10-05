import Link from "next/link";
export const metadata = { title: "Report a concern" };
export default function Page() {
  return (
    <section className="shell page-section account-page">
      <h1>Report a concern</h1>
      <p>
        In the configured local mall, open a shop and choose “Report a concern about this shop”.
        Reports go privately to scoped trust reviewers; merchant enquiries do not reach the platform
        team.
      </p>
      <p>
        This development mall uses fictional records. Live support, emergency assistance and dispute
        resolution are not available.
      </p>
      <Link className="button" href="/">
        Browse the mall
      </Link>
    </section>
  );
}
