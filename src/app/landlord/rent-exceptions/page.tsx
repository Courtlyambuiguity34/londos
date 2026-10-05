import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { rentExceptions } from "@/server/administration";
import { formatMinorMoney } from "@/modules/money";
export const metadata = { title: "Outstanding rent and corrections" };
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/landlord"),
    page = z.coerce
      .number()
      .int()
      .min(0)
      .max(500)
      .parse((await searchParams).page ?? 0),
    rows = await rentExceptions(database(), actor, page);
  return (
    <section className="shell page-section account-page">
      <h1>Outstanding rent and corrections</h1>
      <p>
        Only obligations in your claimed finance scope appear. Corrected finalized obligations are
        listed first. Live collection remains disabled.
      </p>
      <ul className="workspace-list">
        {rows.map((i) => (
          <li key={i.id}>
            <Link href={`/landlord/invoices/${i.id}`}>{i.reference}</Link>
            <span>{i.business_name}</span>
            <span>
              Remaining:{" "}
              {formatMinorMoney(
                (BigInt(i.amount_minor) - BigInt(i.credited_minor)).toString(),
                i.currency,
              )}{" "}
              · {i.finalized ? "Finalized coverage with arrears" : "Awaiting full settlement"}
            </span>
          </li>
        ))}
      </ul>
      {!rows.length ? <p>No outstanding obligations in your current scope on this page.</p> : null}
      <div className="account-links">
        {page > 0 ? <Link href={`?page=${page - 1}`}>Previous page</Link> : null}
        {rows.length === 20 && page < 500 ? (
          <Link href={`?page=${page + 1}`}>Next page</Link>
        ) : null}
        <Link href="/landlord/rent">Claim development rent records</Link>
        <Link href="/landlord">Landlord</Link>
      </div>
    </section>
  );
}
