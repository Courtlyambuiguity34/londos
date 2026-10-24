"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CreateRentPolicy() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/operator/rent-policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: String(data.get("label")),
          amountMinor: String(Math.round(Number(data.get("amountUgX")) * 100)),
          periodDays: Number(data.get("periodDays")),
          graceDays: Number(data.get("graceDays")),
          mallCapacity: Number(data.get("mallCapacity")),
          confirm: true,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        const code = result.error ?? String(response.status);
        const messages: Record<string, string> = {
          permission_denied: "Your account requires the finance operator grant.",
          mfa_required: "Enable and verify two-factor authentication in Account security.",
          fresh_authentication_required: "Your security verification expired. Verify again in Account security, then retry.",
          invalid_input: "Check the rent amount, period, grace days and capacity.",
          service_unavailable: "The server could not save this policy. Provide the request reference to the developer.",
        };
        throw new Error((messages[code] ?? "Unable to create rent policy: " + code) + " (reference: " + (response.headers.get("X-Request-ID") ?? "unavailable") + ")");
      }
      setMessage("Rent policy created. It will now appear in the invoice selector.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create rent policy.");
    } finally {
      setPending(false);
    }
  }
  return <details>
    <summary>Create rent policy</summary>
    <form className="account-form" onSubmit={submit}>
      <label htmlFor="policy-label">Policy name</label>
      <input id="policy-label" name="label" minLength={3} maxLength={100} defaultValue="Standard shop rent" required />
      <label htmlFor="policy-amount">Rent amount (UGX)</label>
      <input id="policy-amount" name="amountUgX" type="number" min="1" max="10000000" step="1" defaultValue="5000" required />
      <label htmlFor="policy-period">Rental period (days)</label>
      <input id="policy-period" name="periodDays" type="number" min="1" max="366" defaultValue="30" required />
      <label htmlFor="policy-grace">Grace period (days)</label>
      <input id="policy-grace" name="graceDays" type="number" min="0" max="30" defaultValue="7" required />
      <label htmlFor="policy-capacity">Mall planning capacity</label>
      <input id="policy-capacity" name="mallCapacity" type="number" min="1" max="5000" defaultValue="1000" required />
      <button className="button" disabled={pending}>{pending ? "Saving…" : "Create policy"}</button>
      <p role="status">{message}</p>
    </form>
  </details>;
}
