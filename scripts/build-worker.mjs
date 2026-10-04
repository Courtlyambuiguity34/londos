import { build } from "esbuild";
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
