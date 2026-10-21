import type { ShopView } from "../../server/public-shop";

export function shopContactActions(
  view: Pick<ShopView, "contact" | "specification" | "shop" | "privatePreview">,
) {
  const c = view.contact;
  if (!c) return [];
  const enabled = view.specification.actions;
  return [
    ...(enabled.includes("whatsapp") && c.whatsapp
      ? [
          {
            kind: "whatsapp",
            label: "WhatsApp shop",
            href: `https://wa.me/${c.whatsapp.slice(1)}`,
            external: true,
          },
        ]
      : []),
    ...(enabled.includes("call") && c.phone
      ? [{ kind: "call", label: "Call shop", href: `tel:${c.phone}`, external: false }]
      : []),
    ...(enabled.includes("enquiry") && c.enquiries_enabled && !view.privatePreview
      ? [
          {
            kind: "enquiry",
            label: "Enquire with the shop",
            href: `/contact/${view.shop.id}`,
            external: false,
          },
        ]
      : []),
    ...(c.website
      ? [{ kind: "website", label: "Merchant website", href: c.website, external: true }]
      : []),
  ];
}
