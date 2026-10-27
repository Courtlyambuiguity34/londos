import type { ShopSpace } from "./shop-design/specification";

export const sectionLabels: Record<ShopSpace["type"], string> = {
  entrance: "Welcome message",
  hero: "Welcome banner",
  story: "Our story",
  offer: "Offer or announcement",
  service_desk: "Help & contact details",
  contact: "Contact details",
  commerce_info: "How to buy",
  display: "Product highlights",
  products: "Product selection",
  product_section: "Product collection",
  gallery: "Photo gallery",
  department: "Department preview",
  collection: "Filtered department collection",
  department_editorial: "Department feature",
  featured_product: "Featured product",
};
export const layoutLabels: Record<string, string> = {
  editorial: "Large headline & open space",
  split: "Side by side",
  product_led: "Product takes the lead",
  spotlight: "Large product spotlight",
  compact: "Small & simple",
  grid: "Neat rows",
  carousel: "Swipeable row",
  summary: "Simple overview",
};
export function catalogueAddress(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/g, "");
}
export function priceToMinor(input: string, currency: string): string | null {
  if (!input.trim()) return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match || !["UGX", "USD", "KES", "EUR", "GBP"].includes(currency))
    throw new Error("Enter a price such as 5000 or 19.95, without commas or currency letters.");
  const fraction = (match[2] ?? "").padEnd(2, "0");
  if (currency === "UGX" && fraction !== "00")
    throw new Error("Enter whole shillings for UGX, such as 5000.");
  const result = (
    BigInt(match[1]!) * (currency === "UGX" ? 1n : 100n) +
    (currency === "UGX" ? 0n : BigInt(fraction))
  ).toString();
  if (result.length > 20) throw new Error("This price is too large. Enter a smaller amount.");
  return result;
}
export function editablePrice(value: string | null, currency: string) {
  if (value === null) return "";
  if (currency === "UGX") return value;
  return `${BigInt(value) / 100n}.${(BigInt(value) % 100n).toString().padStart(2, "0")}`;
}
