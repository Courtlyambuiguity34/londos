import type { ShopView } from "../../server/public-shop";

export function shopContactActions(
  view: Pick<ShopView, "contact" | "specification" | "shop" | "privatePreview">,
) {
  const c = view.contact;
  if (!c) return [];
  const enabled = view.specification.actions;
  const actions = [
    ...(enabled.includes("whatsapp") && c.whatsapp
      ? [
          {
            kind: "whatsapp",
            label: "Message on WhatsApp",
            href: `https://wa.me/${c.whatsapp.replace(/^\+/, "").replace(/\s/g, "")}`,
            external: true,
          },
        ]
      : []),
    ...(enabled.includes("call") && c.phone
      ? [{ kind: "call", label: "Call the shop", href: `tel:${c.phone}`, external: false }]
      : []),
    ...(enabled.includes("enquiry") && c.enquiries_enabled && !view.privatePreview
      ? [
          {
            kind: "enquiry",
            label: "Send an enquiry",
            href: `/contact/${view.shop.id}`,
            external: false,
          },
        ]
      : []),
    ...(c.website
      ? [{ kind: "website", label: "Merchant website", href: c.website, external: true }]
      : []),
  ];
  return actions.map((action,index)=>({...action,primary:index===0}));
}
