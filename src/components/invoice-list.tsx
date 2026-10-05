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
            {formatMinorMoney(i.amount_minor, i.currency)} ·{" "}
            {BigInt(i.credited_minor) === BigInt(i.amount_minor)
              ? "fully credited"
              : "balance outstanding"}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p>No rent invoices yet. Approval issues the first invoice before a shop is provisioned.</p>
  );
}
