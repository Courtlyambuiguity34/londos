"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function IssueApplicationInvoice({ applicationId, policies }: {
  applicationId: string;
  policies: { id: string; label: string; amount_minor: string; currency: string; period_days: number }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const policyId = String(new FormData(form).get("policyId") ?? "");
    if (!policyId) { setMessage("Choose a rent policy."); return; }
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/operator/applications/${applicationId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyId, confirm: true }),
      });
      const body = await response.json() as { id?: string; error?: string };
      if (!response.ok) {
        const messages: Record<string, string> = {
          initial_invoice_already_issued: "This application already has its first invoice.",
          application_not_approved: "Approve the application before issuing an invoice.",
          policy_unavailable: "This rent policy is unavailable in the current environment.",
          fresh_authentication_required: "Verify your account again in Security, then retry.",
          mfa_required: "Complete MFA verification in Security before issuing an invoice.",
          resource_unavailable: "Claim finance access to this application first.",
        };
        throw new Error(messages[body.error ?? ""] ?? `Invoice could not be issued (${body.error ?? response.status}).`);
      }
      setMessage("Invoice issued. Open it below to review the payment instructions.");
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invoice issuance failed.");
    } finally { setPending(false); }
  }
  return <form className="account-form" onSubmit={submit}>
    <h2>Issue first rent invoice</h2>
    <p>Select the agreed amount and coverage period. Issuing an invoice does not verify payment or activate the shop.</p>
    <label htmlFor="issue-rent-policy">Rent policy</label>
    <select id="issue-rent-policy" name="policyId" required defaultValue="">
      <option value="" disabled>Select policy and rental period</option>
      {policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.label} · {policy.period_days} days · {policy.currency} {Number(policy.amount_minor) / 100}</option>)}
    </select>
    <label className="checkbox-label"><input type="checkbox" required /> I confirm this invoice matches the agreed rent terms</label>
    <button className="button" disabled={pending}>{pending ? "Issuing invoice…" : "Issue invoice to shopkeeper"}</button>
    <p role="status">{message}</p>
  </form>;
}
