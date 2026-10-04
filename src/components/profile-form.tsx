"use client";
import { useState, type FormEvent } from "react";
export function ProfileForm({ shop }: { shop: { id: string; name: string; version: number } }) {
  const [version, setVersion] = useState(shop.version),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("name");
    setPending(true);
    setMessage("");
    try {
      const result = await fetch(`/api/workspace/shops/${shop.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, version }),
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
      <button className="button" disabled={pending}>
        {pending ? "Saving…" : "Save shop name"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
