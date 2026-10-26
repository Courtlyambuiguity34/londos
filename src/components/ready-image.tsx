"use client";
import Image from "next/image";
import { useState } from "react";
export function ReadyImage({
  shopId,
  assetId,
  alt,
  width,
  height,
  privatePreview = false,
  large = false,
  allowRetry = true,
}: {
  shopId: string;
  assetId: string;
  alt: string;
  width: number;
  height: number;
  privatePreview?: boolean;
  large?: boolean;
  allowRetry?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null),
    identity = `${shopId}:${assetId}`;
  const base = privatePreview
    ? `/api/workspace/shops/${shopId}/media/${assetId}`
    : `/api/public/shops/${shopId}/media/${assetId}`;
  if (failed === identity)
    return (
      <div className="image-placeholder" style={{ aspectRatio: `${width}/${height}` }}>
        <p role="img" aria-label={`${alt}: image currently unavailable`}>
          Image currently unavailable
        </p>
        {allowRetry ? (
          <button type="button" className="text-button" onClick={() => setFailed(null)}>
            Retry image
          </button>
        ) : null}
      </div>
    );
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
      onError={() => setFailed(identity)}
    />
  );
}
