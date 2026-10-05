"use client";
import Image from "next/image";
export function ReadyImage({
  shopId,
  assetId,
  alt,
  width,
  height,
  privatePreview = false,
  large = false,
}: {
  shopId: string;
  assetId: string;
  alt: string;
  width: number;
  height: number;
  privatePreview?: boolean;
  large?: boolean;
}) {
  const base = privatePreview
    ? `/api/workspace/shops/${shopId}/media/${assetId}`
    : `/api/public/shops/${shopId}/media/${assetId}`;
  return (
    <Image
      loader={({ width: requested }) =>
        `${base}/${requested <= 384 ? "thumbnail" : requested <= 768 ? "card" : "display"}`
      }
      src={`${base}/display`}
      alt={alt}
      width={width}
      height={height}
      sizes={large ? "(max-width: 700px) 100vw, 600px" : "(max-width: 640px) 50vw, 320px"}
      loading="lazy"
      className="canonical-image"
    />
  );
}
