import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import type { cloudinarySettings } from "./config";
type Settings = ReturnType<typeof cloudinarySettings>;
export class CloudinaryPublicCopy {
  constructor(
    private readonly config: Settings,
    private readonly transport: typeof fetch = fetch,
  ) {}
  async upload(assetId: string, bytes: Buffer, signal: AbortSignal) {
    z.uuid().parse(assetId);
    if (bytes.length > 2097152 || bytes.length === 0) throw new Error("cloudinary_image_budget");
    const metadata = await sharp(bytes, { limitInputPixels: 16000000 }).metadata();
    if (
      metadata.format !== "webp" ||
      (metadata.pages && metadata.pages > 1) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 1920 ||
      metadata.height > 1920
    )
      throw new Error("normalized_public_image_required");
    const digest = createHash("sha256").update(bytes).digest("hex"),
      publicId = `londos-public-copy/${assetId}/${digest}`,
      timestamp = Math.floor(Date.now() / 1000);
    const signed = `overwrite=false&public_id=${publicId}&timestamp=${timestamp}${this.config.apiSecret}`;
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(bytes)], { type: "image/webp" }), "public.webp");
    form.set("public_id", publicId);
    form.set("overwrite", "false");
    form.set("timestamp", String(timestamp));
    form.set("api_key", this.config.apiKey);
    form.set("signature", createHash("sha256").update(signed).digest("hex"));
    const response = await this.transport(
      `https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/upload`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        body: form,
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("cloudinary_copy_failed");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("cloudinary_response_missing");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 65536) throw new Error("cloudinary_response_budget");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const result = z
      .object({
        public_id: z.literal(publicId),
        secure_url: z.url(),
        width: z.literal(metadata.width),
        height: z.literal(metadata.height),
        format: z.literal("webp"),
        bytes: z.number().int().positive().max(2097152),
      })
      .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const url = new URL(result.secure_url);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "res.cloudinary.com" ||
      url.username ||
      url.password ||
      !url.pathname.startsWith(`/${this.config.cloudName}/image/upload/`) ||
      url.search ||
      url.hash
    )
      throw new Error("cloudinary_delivery_url_invalid");
    return { assetId, publicId, url: url.href, digest, width: result.width, height: result.height };
  }
}
