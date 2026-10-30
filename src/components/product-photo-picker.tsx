"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
export type PhotoAsset = {
  id: string;
  state: string;
  version: number;
  alt: string;
  width: number | null;
  height: number | null;
};
export function ProductPhotoPicker({
  shopId,
  initialId,
  assets,
  onPending,
  onSelected,
}: {
  shopId: string;
  initialId: string;
  assets: PhotoAsset[];
  onPending: (busy: boolean) => void;
  onSelected: (id: string) => void;
}) {
  const root = `/api/workspace/shops/${shopId}/media`;
  const [items, setItems] = useState(assets),
    [selected, setSelected] = useState(initialId),
    [local, setLocal] = useState(""),
    [status, setStatus] = useState(""),
    [working, setWorking] = useState(false),
    [waiting, setWaiting] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      onPending(false);
    },
    [onPending],
  );
  useEffect(
    () => () => {
      if (local) URL.revokeObjectURL(local);
    },
    [local],
  );
  function choose(id: string) {
    setSelected(id);
    onSelected(id);
  }
  async function check(id: string, signal: AbortSignal) {
    for (let attempt = 0; attempt < 30; attempt++) {
      signal.throwIfAborted();
      const response = await fetch(root, { cache: "no-store", signal });
      if (!response.ok)
        throw Error("The photo status could not load. Your product details are still here.");
      const current = (await response.json()) as PhotoAsset[];
      setItems(current);
      const asset = current.find((item) => item.id === id);
      if (asset?.state === "ready") {
        choose(id);
        setWaiting(null);
        setLocal("");
        setStatus("Photo ready and selected for this product.");
        return;
      }
      if (asset?.state === "failed")
        throw Error(
          "This photo could not be prepared. Choose a supported, undamaged JPEG, PNG or WebP, or retry it in Images.",
        );
      await new Promise<void>((resolve, reject) => {
        const cancelled = () => {
          clearTimeout(timer);
          reject(new DOMException("Cancelled", "AbortError"));
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", cancelled);
          resolve();
        }, 1500);
        signal.addEventListener("abort", cancelled, { once: true });
      });
    }
    setStatus(
      "Your photo is taking longer than expected. Keep your details here and check again shortly, or save the product hidden for later. If this continues, contact Londos support.",
    );
  }
  async function upload(file: File, form: HTMLFormElement | null) {
    controller.current?.abort();
    const task = new AbortController();
    controller.current = task;
    setWorking(false);
    onPending(false);
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      !file.size ||
      file.size > 4194304
    ) {
      setStatus("Choose a JPEG, PNG or WebP photo up to 4 MiB.");
      return;
    }
    setLocal(URL.createObjectURL(file));
    choose("");
    setWaiting(null);
    setWorking(true);
    onPending(true);
    setStatus("Uploading your photo…");
    try {
      const title = (form?.elements.namedItem("name") as HTMLInputElement | null)?.value.trim();
      const started = await fetch(root, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: file.type,
          bytes: file.size,
          alt: (title ? `Photo of ${title}` : "Product photo").slice(0, 240),
        }),
        signal: task.signal,
      });
      if (!started.ok)
        throw Error(
          "The photo upload could not start. Check your access and image storage, then try again.",
        );
      const asset = (await started.json()) as { id: string };
      setWaiting(asset.id);
      const uploaded = await fetch(`${root}/${asset.id}`, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
        signal: task.signal,
      });
      if (!uploaded.ok) {
        setWaiting(null);
        throw Error(
          "The photo was not uploaded completely. Your product details are still here; choose the photo again.",
        );
      }
      setStatus("Preparing your photo for the shop…");
      await check(asset.id, task.signal);
    } catch (error) {
      if (!task.signal.aborted)
        setStatus(
          error instanceof Error ? error.message : "The photo was not confirmed. Try again.",
        );
    } finally {
      if (!task.signal.aborted) {
        setWorking(false);
        onPending(false);
      }
    }
  }
  return (
    <div className="product-photo-picker">
      <label htmlFor="product-photo-file">Take or choose a product photo</label>
      <input
        id="product-photo-file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void upload(file, event.currentTarget.form);
          event.currentTarget.value = "";
        }}
      />
      <p className="editor-hint">
        JPEG, PNG or WebP, up to 4 MiB. We prepare and select the photo for you.
      </p>
      {local || selected ? (
        <div className="product-photo-preview">
          <Image
            unoptimized
            src={local || `${root}/${selected}/thumbnail`}
            alt="Selected product photo preview"
            width={240}
            height={180}
          />
        </div>
      ) : null}
      <details>
        <summary>Choose from your uploaded photos</summary>
        <label htmlFor="product-photo-existing">Product photo</label>
        <select
          id="product-photo-existing"
          name="image"
          value={selected}
          disabled={working}
          onChange={(event) => {
            choose(event.target.value);
            setLocal("");
            setStatus(event.target.value ? "Existing photo selected." : "No photo selected.");
          }}
        >
          <option value="">No photo selected</option>
          {selected && !items.some((item) => item.id === selected) ? (
            <option value={selected}>Selected photo</option>
          ) : null}
          {items
            .filter((item) => item.state === "ready")
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.alt}
              </option>
            ))}
        </select>
      </details>
      <p role="status" aria-label="Product photo status">
        {status}
      </p>
      {waiting && !working ? (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            const task = new AbortController();
            controller.current = task;
            setWorking(true);
            onPending(true);
            void check(waiting, task.signal)
              .catch((error) => {
                if (!task.signal.aborted)
                  setStatus(error instanceof Error ? error.message : "Photo check failed.");
              })
              .finally(() => {
                if (!task.signal.aborted) {
                  setWorking(false);
                  onPending(false);
                }
              });
          }}
        >
          Check photo again
        </button>
      ) : null}
    </div>
  );
}
