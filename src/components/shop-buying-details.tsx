type BuyingDetails = {
  fulfilment: string;
  delivery_instructions: string;
  payment_instructions: string;
};

const fulfilmentLabels: Record<string, string> = {
  contact: "Ask the shop about collection or delivery",
  pickup: "Collection offered",
  delivery: "Delivery offered",
  pickup_and_delivery: "Collection and delivery offered",
};

// These are merchant-provided details, never a platform fulfilment promise.
export function ShopBuyingDetails({ contact }: { contact: BuyingDetails }) {
  return (
    <div className="shop-buying-details">
      <p className="shop-buying-details-source">Provided by this shop</p>
      <dl>
        <div>
          <dt>Collection & delivery</dt>
          <dd>{fulfilmentLabels[contact.fulfilment] ?? fulfilmentLabels.contact}</dd>
          {contact.delivery_instructions ? <dd>{contact.delivery_instructions}</dd> : null}
        </div>
        {contact.payment_instructions ? (
          <div>
            <dt>Payment arrangements</dt>
            <dd>{contact.payment_instructions}</dd>
          </div>
        ) : null}
      </dl>
      <p>
        Confirm availability, any delivery costs, timing and return terms with the merchant before
        paying.
      </p>
    </div>
  );
}
