import { build } from "esbuild";
await build({
  entryPoints: ["scripts/release/bootstrap.ts"],
  outfile: "dist/bootstrap.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  sourcemap: false,
});
await build({
  entryPoints: ["src/worker/main.ts"],
  outfile: "dist/worker.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  sourcemap: false,
});
console.log("Packaged independent Node worker; runtime dependencies remain external.");
await build({
  entryPoints: ["scripts/release/operations.ts"],
  outfile: "dist/operations.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  sourcemap: false,
});

await build({
  entryPoints: ["scripts/release/migrate.ts"],
  outfile: "dist/migrate.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  sourcemap: false,
});
