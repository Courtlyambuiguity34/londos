import sharp from "sharp";
import { mkdir, writeFile, copyFile } from "node:fs/promises";

// Mechanical sizing/packaging only. Artwork comes from the approved generated masters.
const source = "docs/design/brand-masters";
const output = "public/brand";
await mkdir(output, { recursive: true });
const png = { compressionLevel: 9, palette: true, colours: 128 };
for (const [master, name] of [
  ["logo", "londos-logo"],
  ["logo-dark", "londos-logo-dark"],
]) {
  const trimmed = await sharp(`${source}/${master}.png`).trim().toBuffer();
  await sharp(trimmed)
    .resize(1200, 400, {
      fit: "contain",
      background: master === "logo" ? "#00000000" : "#364636",
    })
    .png(png)
    .toFile(`${output}/${name}.png`);
}
for (const name of ["mark"]) {
  const trimmed = await sharp(`${source}/${name}.png`).trim().toBuffer();
  await sharp(trimmed)
    .resize(1024, 1024, { fit: "contain", background: "#00000000" })
    .png(png)
    .toFile(`${output}/londos-${name}.png`);
}
const app = `${source}/app.png`;
for (const [name, size, fraction] of [
  ["app-icon-192", 192, 1],
  ["app-icon-512", 512, 1],
  // Inset the full icon to protect its mark within the central safe circle.
  ["app-icon-maskable-512", 512, 0.7],
  ["apple-touch-icon", 180, 1],
  ["favicon-64", 64, 1],
]) {
  const side = Math.floor(size * fraction);
  const mark = await sharp(app)
    .resize(side, side, { fit: "contain", background: "#364636" })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#364636" } })
    .composite([{ input: mark, gravity: "centre" }])
    .png(png)
    .toFile(`${output}/${name}.png`);
}
await copyFile(`${output}/favicon-64.png`, "src/app/icon.png");
// Existing installed clients may still request the old URLs.
await copyFile(`${output}/app-icon-192.png`, "public/pwa/icon-192.png");
await copyFile(`${output}/app-icon-maskable-512.png`, "public/pwa/icon-512.png");
const embedded = (await sharp(`${output}/app-icon-512.png`).png().toBuffer()).toString("base64");
await writeFile(
  "public/pwa/londos-icon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Londos"><image width="512" height="512" href="data:image/png;base64,${embedded}"/></svg>\n`,
);
console.log("Built website logos, browser/Apple icons, PWA icons and legacy compatibility assets.");
