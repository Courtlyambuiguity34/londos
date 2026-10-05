"use client";
import { useState, type FormEvent } from "react";
export function ProfileForm({
  shop,
}: {
  shop: { id: string; name: string; version: number; category: string; tagline: string };
}) {
  const [version, setVersion] = useState(shop.version),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget),
      name = fields.get("name"),
      category = fields.get("category"),
      tagline = fields.get("tagline");
    setPending(true);
    setMessage("");
    try {
      const result = await fetch(`/api/workspace/shops/${shop.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, tagline, version }),
      });
      const data = (await result.json()) as { version?: number };
      if (!result.ok) {
        setMessage(
          result.status === 409
            ? "This shop changed in another session. Reload before editing."
            : "The change could not be saved. Check access and try again.",
        );
        return;
      }
      setVersion(data.version!);
      setMessage("Saved. Background processing is queued.");
    } catch {
      setMessage("The service is unavailable. Your edit was not confirmed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="account-form" onSubmit={submit}>
      <label htmlFor="shop-name">Shop name</label>
      <input id="shop-name" name="name" defaultValue={shop.name} required maxLength={120} />
      <label htmlFor="shop-category">Shop category</label>
      <select id="shop-category" name="category" defaultValue={shop.category}>
        {["fashion", "electronics", "beauty", "food", "home", "services", "other"].map(
          (category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ),
        )}
      </select>
      <label htmlFor="shop-tagline">Shop introduction</label>
      <input id="shop-tagline" name="tagline" defaultValue={shop.tagline} maxLength={160} />
      <button className="button" disabled={pending}>
        {pending ? "Saving…" : "Save shop profile"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
