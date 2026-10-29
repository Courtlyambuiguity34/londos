import Link from "next/link";
import { Icon } from "./icon";

export function ShopPurchaseNote({
  shopId,
  development = false,
  sample = false,
}: {
  shopId?: string;
  development?: boolean;
  sample?: boolean;
}) {
  return (
    <aside className="shop-contact-note shop-purchase-note" aria-label="Buying from this shop">
      <div className="purchase-note-heading">
        <span className="purchase-note-icon">
          <Icon name="shop" />
        </span>
        <div>
          <p className="purchase-note-eyebrow">Shopping essentials</p>
          <h2>{sample ? "A preview of what’s possible." : "Before you buy."}</h2>
        </div>
      </div>
      <div className="purchase-note-copy">
        {sample ? (
          <p>
            These shops and prices are fictional. Merchant contact, purchases and enquiries are
            unavailable in this preview.
          </p>
        ) : (
          <>
            <p>
              {development
                ? "This development mall uses fictional merchants. No payment is collected by Londos."
                : "Londos does not collect payment for purchases from shops."}
            </p>
            <p>
              Merchant terms apply to purchases and fulfilment. A contact action is not a confirmed
              sale.
            </p>
          </>
        )}
      </div>
      <div className="purchase-note-actions">
        <Link className="purchase-note-report" href="/help">
          Shopping questions? Read the buyer guide <Icon name="arrow" />
        </Link>
        {shopId ? (
          <Link prefetch={false} className="purchase-note-report" href={`/report/${shopId}`}>
            Report a concern about this shop <Icon name="arrow" />
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
