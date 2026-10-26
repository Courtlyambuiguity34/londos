import { expect, test } from "vitest";
import { activePortalHref } from "../../src/modules/portal-navigation";
import { merchantAccountLinks } from "../../src/modules/workspace-links";

test("only the most specific workspace destination is active", () => {
  const links = ["/shopkeeper", "/shopkeeper/shops/shop", "/shopkeeper/shops/shop/design"];
  expect(activePortalHref("/shopkeeper/shops/shop/design/assistant", links)).toBe(links[2]);
  expect(activePortalHref("/shopkeeper/shops/shop", links)).toBe(links[1]);
  expect(activePortalHref("/shopkeeper", links)).toBe(links[0]);
  expect(activePortalHref("/shopkeeper/shops/another", links)).toBeUndefined();
});

test("every merchant workspace distinguishes team administration from received invitations", () => {
  const teams = merchantAccountLinks.find((link) => link.href === "/shopkeeper/team");
  const invitations = merchantAccountLinks.find((link) => link.href === "/shopkeeper/invitations");
  expect(teams?.description).toContain("Invite teammates");
  expect(invitations?.label).toBe("Received invitations");
  expect(new Set(merchantAccountLinks.map((link) => link.href)).size).toBe(
    merchantAccountLinks.length,
  );
  expect(merchantAccountLinks.every((link) => !link.href.startsWith("/landlord"))).toBe(true);
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
