"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export function RetireDemoForm({ userId, version }: { userId: string; version: number }) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/operator/demo-accounts/${encodeURIComponent(userId)}/retire`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version,
            reason: String(fields.get("reason")),
            confirm: fields.get("confirm") === "on",
          }),
        },
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          data.error === "fresh_authentication_required"
            ? "Verify a fresh MFA code, then reload."
            : data.error === "stale_version"
              ? "This account changed. Reload before retrying."
              : "The account could not be retired. Check operator access and reload.",
        );
      }
      setMessage("Demonstration account retired.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The service is unavailable.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="account-form" onSubmit={submit}>
      <label htmlFor={`reason-${userId}`}>Reason for removing this demonstration account</label>
      <input id={`reason-${userId}`} name="reason" minLength={5} maxLength={500} required />
      <label className="checkbox-label">
        <input name="confirm" type="checkbox" required />
        Revoke sign-in and hide this merchant’s shops
      </label>
      <button className="button button--outline" disabled={pending}>
        {pending ? "Removing…" : "Remove demonstration account"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
