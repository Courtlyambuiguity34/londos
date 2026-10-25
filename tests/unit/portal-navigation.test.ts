import { expect, test } from "vitest";
import { activePortalHref } from "../../src/modules/portal-navigation";

test("only the most specific workspace destination is active", () => {
  const links = ["/shopkeeper", "/shopkeeper/shops/shop", "/shopkeeper/shops/shop/design"];
  expect(activePortalHref("/shopkeeper/shops/shop/design/assistant", links)).toBe(links[2]);
  expect(activePortalHref("/shopkeeper/shops/shop", links)).toBe(links[1]);
  expect(activePortalHref("/shopkeeper", links)).toBe(links[0]);
  expect(activePortalHref("/shopkeeper/shops/another", links)).toBeUndefined();
});
test("navigation matching respects route segments and workspace boundaries", () => {
  expect(
    activePortalHref("/landlord/rent-exceptions", ["/landlord", "/landlord/rent"]),
  ).toBeUndefined();
  expect(activePortalHref("/landlord", ["/shopkeeper"])).toBeUndefined();
  expect(activePortalHref("/shopkeeper/invitations", ["/shopkeeper/invitations"])).toBe(
    "/shopkeeper/invitations",
  );
});
