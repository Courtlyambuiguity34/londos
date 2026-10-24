import Link from "next/link";
import type { Invoice } from "@/server/rent";
import { formatMinorMoney } from "@/modules/money";
export function InvoiceList({
  invoices,
  operator = false,
}: {
  invoices: Invoice[];
  operator?: boolean;
}) {
  return invoices.length ? (
    <ul className="workspace-list">
      {invoices.map((i) => (
        <li key={i.id}>
          <Link
            className="break-anywhere"
            href={`/${operator ? "landlord" : "shopkeeper"}/invoices/${i.id}`}
          >
            {i.reference}
          </Link>
          <span>
            {i.shop_id ? "Shop renewal" : "Approved application"} · issued{" "}
            <time dateTime={new Date(i.issued_at).toISOString()}>
              {new Date(i.issued_at).toLocaleDateString("en-UG", { timeZone: "Africa/Kampala" })}
            </time>
            {" · "}
            {formatMinorMoney(i.amount_minor, i.currency)} ·{" "}
            {BigInt(i.credited_minor) === BigInt(i.amount_minor)
              ? "fully credited"
              : "balance outstanding"}
          </span>
          <span>
            {i.finalized
              ? `Verified coverage: ${new Date(i.period_start).toLocaleDateString("en-UG", { timeZone: "Africa/Kampala" })} – ${new Date(i.period_end).toLocaleDateString("en-UG", { timeZone: "Africa/Kampala" })}`
              : "Coverage starts only after full payment is independently verified"}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p>No rent invoices yet. Approval issues the first invoice before a shop is provisioned.</p>
  );
}
