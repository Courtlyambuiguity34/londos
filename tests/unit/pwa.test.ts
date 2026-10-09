import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { isPwaSurface, pwaManifest, pwaSurfaces } from "../../src/modules/pwa/manifest";

test("each Londos audience gets a distinct install identity and safe start route", () => {
  const manifests = pwaSurfaces.map(pwaManifest);
  expect(manifests.map((manifest) => manifest.id)).toEqual([
    "/pwa/public",
    "/pwa/shopkeeper",
    "/pwa/landlord",
  ]);
  expect(manifests.map((manifest) => manifest.start_url)).toEqual([
    "/",
    "/shopkeeper",
    "/landlord",
  ]);
  for (const manifest of manifests) {
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(["192x192", "512x512"]);
  }
  expect(isPwaSurface("landlord")).toBe(true);
  expect(isPwaSurface("operator-without-permission")).toBe(false);
});

test("service worker lifecycle does not cache private or dynamic responses", () => {
  const serviceWorker = readFileSync(resolve(import.meta.dirname, "../../public/sw.js"), "utf8");
  expect(serviceWorker).not.toContain('addEventListener("fetch"');
  expect(serviceWorker).not.toContain("caches.open");
  expect(serviceWorker).toContain(
    "does not cache HTML, API responses, authentication, or private data",
  );
});
