import { expect, test } from "vitest";
import { shopAddressBase } from "../../src/server/shop-address";
import { shopAddressInput, legacyShopAddress } from "../../src/modules/shop-address";
import { storefrontStatus } from "../../src/modules/storefront-status";
import { brevoMessage } from "../../src/server/jobs/brevo";

test("shop addresses use readable names and safe bounded fallbacks", () => {
  expect(shopAddressBase("  Annette’s Fashion House  ")).toBe("annettes-fashion-house");
  expect(shopAddressBase("Café & Décor")).toBe("cafe-decor");
  for (const name of ["A", "店", "---", "x".repeat(120)]) {
    const slug = shopAddressBase(name);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(slug.length).toBeGreaterThanOrEqual(3);
    expect(slug.length).toBeLessThanOrEqual(70);
  }
});

test("readable addresses reject generated ID tails but retain digits in real business names", () => {
  const id = "68a40e06-65f8-4e07-a5d5-61c7ed87d799";
  for (const value of [
    id,
    `nguzza-agricultural-suppliers-${id}`,
    `shop-${id.replaceAll("-", "")}`,
    "12345",
    "../another-shop",
  ])
    expect(shopAddressInput.safeParse(value).success).toBe(false);
  for (const value of [
    "nguzza-agricultural-suppliers",
    "nguzza-agricultural-suppliers-mbale",
    "24-seven",
    "studio-54",
  ])
    expect(shopAddressInput.safeParse(value).success).toBe(true);
  expect(legacyShopAddress(`nguzza-agricultural-suppliers-${id}`, id)).toBe(
    "nguzza-agricultural-suppliers",
  );
  expect(legacyShopAddress(`another-${id}`, "11111111-1111-4111-8111-111111111111")).toBeNull();
});

const live = {
  publication: "active",
  tenancy: "active",
  moderation: "clear",
  paused: false,
  published_design: true,
};
test("payment eligibility alone never represents an unpublished shop as public", () => {
  expect(
    storefrontStatus({ ...live, publication: "unpublished", published_design: false }),
  ).toMatchObject({ public: false, next: "design" });
  expect(storefrontStatus({ ...live, published_design: false }).public).toBe(false);
  for (const tenancy of ["active", "due", "grace"])
    expect(storefrontStatus({ ...live, tenancy })).toMatchObject({ public: true, next: null });
});
test("independent restrictions override publication and paid tenancy", () => {
  for (const change of [
    { moderation: "suspended" },
    { moderation: "pending" },
    { paused: true },
    { publication: "archived" },
    { publication: "temporarily_closed" },
    { tenancy: "closed" },
    { tenancy: "pending" },
  ])
    expect(storefrontStatus({ ...live, ...change }).public).toBe(false);
});

test("rent mail retains legacy payload support and labels separately configured collection networks", () => {
  const message = {
    template: "tenancy-status",
    to: "owner@example.org",
    shopId: "11111111-1111-4111-8111-111111111111",
    state: "renewal_due",
    periodEnd: "2026-11-30T00:00:00Z",
  };
  const payment = {
    supportEmail: "support@example.org",
    supportPhone: null,
    mobileMoneyPhone: "+256700000001",
    mobileMoneyName: "Legacy account",
    bankName: null,
    bankAccountName: null,
    bankAccountNumber: null,
  };
  expect(brevoMessage({ ...message, payment }, "https://mall.example.org").text).toContain(
    "Mobile money: +256700000001",
  );
  const rendered = brevoMessage(
    {
      ...message,
      payment: {
        ...payment,
        mobileMoneyPhone: "+256700000002",
        mtnMomoPhone: "+256700000002",
        mtnMomoName: "MTN owner",
        airtelMoneyPhone: "+256700000003",
        airtelMoneyName: "Airtel owner",
      },
    },
    "https://mall.example.org",
  );
  expect(rendered.text).toContain("MTN MoMo: +256700000002 (MTN owner)");
  expect(rendered.text).toContain("Airtel Money: +256700000003 (Airtel owner)");
  expect(rendered.text).not.toContain("Mobile money:");
  expect(() =>
    brevoMessage(
      { ...message, payment: { ...payment, mtnMomoPhone: "+256700000002" } },
      "https://mall.example.org",
    ),
  ).toThrow();
});
