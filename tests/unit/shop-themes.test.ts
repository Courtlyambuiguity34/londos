import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  shopThemes,
  themeDefinition,
  applyShopTheme,
} from "../../src/modules/shop-themes/catalogue";
import {
  shopSpecification,
  type ShopSpecification,
} from "../../src/modules/shop-design/specification";
import { distinctShopSections, starterSections } from "../../src/modules/shop-themes/sections";
import { compileIntent, deterministicIntent } from "../../src/modules/ai-design/contract";

const spec: ShopSpecification = {
  schemaVersion: 1,
  theme: "earth",
  announcement: "Merchant announcement",
  branding: { coverAssetId: randomUUID(), logoAssetId: null },
  spaces: [
    {
      id: "intro",
      type: "entrance",
      version: 1,
      title: "Our own introduction",
      body: "Written by the merchant.",
    },
  ],
  actions: ["call", "enquiry"],
};
test.each(shopThemes)(
  "$name has a valid accessible bounded definition and retains merchant content",
  (theme) => {
    expect(themeDefinition.parse(theme)).toEqual(theme);
    const before = structuredClone(spec),
      next = applyShopTheme(spec, theme.id);
    expect(shopSpecification.parse(next)).toEqual(next);
    expect(next.branding).toEqual(before.branding);
    expect(next.spaces).toEqual(before.spaces);
    expect(next.actions).toEqual(before.actions);
    expect(next.announcement).toBe(before.announcement);
    expect(spec).toEqual(before);
    const context = {
      shop: { name: "Fictional merchant", category: "food", tagline: "" },
      departments: [],
      products: [],
      specification: spec,
    };
    const intent = deterministicIntent(context, `Use ${theme.name} theme`);
    expect(intent?.patches).toEqual([{ op: "storefront_theme", id: theme.id }]);
    expect(compileIntent(context, intent)).toEqual(next);
  },
);
test("unknown theme writes fail while a retired stored theme does not erase content on read", () => {
  expect(() => applyShopTheme(spec, "unreviewed-theme")).toThrow("unavailable");
  expect(shopSpecification.parse({ ...spec, storefrontTheme: "retired-theme" }).spaces).toEqual(
    spec.spaces,
  );
  expect(
    shopSpecification.safeParse({ ...spec, storefrontTheme: "https://evil.invalid/style.css" })
      .success,
  ).toBe(false);
  for (const extra of [
    { css: "body{display:none}" },
    { script: "alert(1)" },
    { image: "https://example.invalid/track" },
  ])
    expect(themeDefinition.safeParse({ ...shopThemes[0], ...extra }).success).toBe(false);
  expect(
    themeDefinition.safeParse({
      ...shopThemes[0],
      presentation: {
        ...shopThemes[0]!.presentation,
        palette: { ...shopThemes[0]!.presentation.palette, text: "white", background: "white" },
      },
    }).success,
  ).toBe(false);
});
test("duplicate sections collapse only identical content and leave the stored design unchanged", () => {
  const first = spec.spaces[0];
  if (first?.type !== "entrance") throw Error("Narrative fixture required");
  const source = [
    first,
    { ...first, id: "copy" },
    { ...first, id: "different", body: "A different merchant story." },
  ];
  const before = structuredClone(source),
    distinct = distinctShopSections(source);
  expect(distinct.map((space) => space.id)).toEqual(["intro", "different"]);
  expect(source).toEqual(before);
  expect(
    starterSections(
      Array.from({ length: 8 }, (_, i) => ({ id: randomUUID(), name: `Department ${i}` })),
    ),
  ).toHaveLength(4);
});
test("selecting a theme preserves an incomplete unsaved text edit for later validation", () => {
  const first = spec.spaces[0];
  if (first?.type !== "entrance") throw Error("Narrative fixture required");
  const draft = { ...spec, spaces: [{ ...first, title: "" }] };
  const changed = applyShopTheme(draft, "harvest");
  expect(changed.spaces[0]).toMatchObject({ title: "" });
  expect(shopSpecification.safeParse(changed).success).toBe(false);
});
test("adding one reviewed JSON file is discovered automatically and stale registries are detected", async () => {
  const root = await mkdtemp(join(tmpdir(), "londos-themes-"));
  const folder = join(root, "src/modules/shop-themes/presets");
  await mkdir(folder, { recursive: true });
  const script = resolve("scripts/generate-shop-themes.mjs");
  const run = (check = false) =>
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const {generateThemeRegistry}=await import(${JSON.stringify(script)});await generateThemeRegistry(${JSON.stringify(root)},${check});`,
      ],
      { stdio: "pipe" },
    );
  try {
    await writeFile(
      join(folder, "atelier.json"),
      JSON.stringify(shopThemes.find((theme) => theme.id === "atelier")),
    );
    run();
    run(true);
    const initial = await readFile(
      join(root, "src/modules/shop-themes/registry.generated.ts"),
      "utf8",
    );
    await writeFile(
      join(folder, "custom-studio.json"),
      JSON.stringify({ ...shopThemes[0], id: "custom-studio", name: "Custom Studio" }),
    );
    expect(() => run(true)).toThrow();
    run();
    run(true);
    const generated = await readFile(
      join(root, "src/modules/shop-themes/registry.generated.ts"),
      "utf8",
    );
    expect(generated).toContain("./presets/custom-studio.json");
    expect(generated).not.toBe(initial);
    await writeFile(
      join(folder, "bad.json"),
      JSON.stringify({ ...shopThemes[0], id: "../../private" }),
    );
    expect(() => run()).toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
