import { expect, test } from "vitest";
import { campaignCtaError, validCampaignPath } from "../../src/modules/communications/cta";
import { campaignInput } from "../../src/server/communications";
import { shopContactActions } from "../../src/modules/shop-design/contact-actions";
import { rentGraceDeadline, invoiceStatus, claimLabels } from "../../src/modules/rent-presentation";
import type { ShopView } from "../../src/server/public-shop";

const view: Pick<ShopView, "contact" | "specification" | "shop" | "privatePreview"> = {
  shop: { id: "fixture", name: "Test", slug: "test", tagline: "", version: 1, category: "fashion" },
  privatePreview: false,
  specification: {
    schemaVersion: 1,
    theme: "earth",
    announcement: "",
    spaces: [],
    actions: ["call", "enquiry", "whatsapp"],
  },
  contact: {
    phone: "+256700000001",
    whatsapp: "+256700000002",
    website: "https://example.com",
    enquiries_enabled: true,
    fulfilment: "contact",
    delivery_instructions: "",
    payment_instructions: "",
  },
};
test("contact priority uses only enabled methods; private preview never offers enquiry submission", () => {
  expect(shopContactActions(view).map((a) => a.kind)).toEqual([
    "whatsapp",
    "call",
    "enquiry",
    "website",
  ]);
  expect(
    shopContactActions({
      ...view,
      specification: { ...view.specification, actions: ["call"] },
    }).map((a) => a.kind),
  ).toEqual(["call", "website"]);
  expect(shopContactActions({ ...view, privatePreview: true }).map((a) => a.kind)).not.toContain(
    "enquiry",
  );
  expect(shopContactActions({ ...view, contact: null })).toEqual([]);
  expect(
    shopContactActions({
      ...view,
      contact: { ...view.contact!, phone: "", whatsapp: "", website: "", enquiries_enabled: false },
    }),
  ).toEqual([]);
});
test.each([
  "//attacker.example",
  "https://attacker.example",
  "/../landlord",
  "/shops/./test",
  "/%2f%2fattacker",
  "/\\attacker",
  "/test\n",
])("campaign rejects unsafe path %s before queuing", (ctaPath) => {
  expect(validCampaignPath(ctaPath)).toBe(false);
  expect(campaignCtaError("Open", ctaPath)).not.toBeNull();
  expect(
    campaignInput.safeParse({
      subject: "Test message",
      body: "Test body for merchant",
      audience: "all_shops",
      confirm: true,
      ctaLabel: "Open",
      ctaPath,
    }).success,
  ).toBe(false);
});
test("campaign supports existing local paths and does not silently discard half a button", () => {
  for (const path of [
    "/",
    "/shopkeeper",
    "/shopkeeper/applications",
    "/shops/test/products/shoes?from=notice",
  ])
    expect(campaignCtaError("Open", path)).toBeNull();
  expect(campaignCtaError("", "")).toBeNull();
  expect(campaignCtaError("Open", "")).not.toBeNull();
  expect(campaignCtaError("", "/shopkeeper")).not.toBeNull();
});
test("rent presentation never equates a pending or accepted claim to a fully credited invoice", () => {
  expect(invoiceStatus("5000", "0", [{ state: "pending" }])).toContain("awaits verification");
  expect(invoiceStatus("5000", "1000", [{ state: "verified" }])).toContain("Partly credited");
  expect(invoiceStatus("5000", "0", [{ state: "rejected" }])).toBe("Awaiting verified credit");
  expect(invoiceStatus("90071992547409930", "90071992547409929", [])).toContain("Partly credited");
  expect(invoiceStatus("5000", "5000", [])).toContain("Fully credited");
  expect(claimLabels.rejected).toContain("review reason");
});
test("grace deadline uses the real policy without guessing a missing contract", () => {
  expect(rentGraceDeadline("2026-10-01T10:00:00Z", 7)?.toISOString()).toBe(
    "2026-10-08T10:00:00.000Z",
  );
  expect(rentGraceDeadline("2026-10-01T10:00:00Z", 0)?.toISOString()).toBe(
    "2026-10-01T10:00:00.000Z",
  );
  expect(rentGraceDeadline(null, 7)).toBeNull();
  expect(rentGraceDeadline("bad", 7)).toBeNull();
  expect(rentGraceDeadline("2026-10-01", null)).toBeNull();
});
