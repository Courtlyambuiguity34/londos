"use client";
import { useState } from "react";
import { Icon } from "./icon";
import { setSavedShop, useSavedShops } from "@/modules/discovery/saved-store";

export function SaveShopButton({
  id,
  name,
  compact = false,
}: {
  id: string;
  name: string;
  compact?: boolean;
}) {
  const saved = useSavedShops().includes(id);
  const [message, setMessage] = useState("");
  return (
    <div className={`save-shop-control${compact ? " save-shop-control--compact" : ""}`}>
      <button
        type="button"
        className="save-shop-button"
        aria-pressed={saved}
        aria-label={`${saved ? "Remove" : "Save"} ${name}${saved ? " from saved shops" : " to saved shops"}`}
        onClick={() => {
          try {
            setSavedShop(id, !saved);
            setMessage(saved ? "Removed from saved shops." : "Shop saved on this browser.");
          } catch (error) {
            setMessage(
              error instanceof Error && error.message.startsWith("You can save")
                ? error.message
                : "This browser could not save the shop. Check that site storage is allowed.",
            );
          }
        }}
      >
        <Icon name="heart" />
        {!compact ? <span>{saved ? "Saved" : "Save shop"}</span> : null}
      </button>
      <span className="save-shop-feedback" role="status">
        {message}
      </span>
    </div>
  );
}
