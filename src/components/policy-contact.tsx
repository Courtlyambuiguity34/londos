import Link from "next/link";

export function PolicyContact() {
  const email = process.env.LONDOS_SUPPORT_EMAIL;
  return (
    <p>
      {email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? (
        <>
          Contact Londos at <a href={`mailto:${email}`}>{email}</a>.{" "}
        </>
      ) : (
        <>For a concern involving a shop, use its report link to contact Londos privately. </>
      )}
      Shop owners can also use Business data and privacy in their workspace.{" "}
      <Link href="/report">Reporting help</Link>.
    </p>
  );
}
