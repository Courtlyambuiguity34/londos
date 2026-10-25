"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatMinorMoney } from "@/modules/money";
import { wholeUgxAmount } from "@/modules/rent-form-values";

export function IssueApplicationInvoice({
  applicationId,
  policies,
}: {
  applicationId: string;
  policies: {
    id: string;
    label: string;
    amount_minor: string;
    currency: string;
    period_days: number;
  }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const policyId = String(data.get("policyId") ?? "");
    if (!policyId) {
      setMessage("Choose a rent policy.");
      return;
    }
    const amountUGX = String(data.get("amountUGX") ?? "").trim();
    const period = String(data.get("periodDays") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    const dueDate = String(data.get("dueAt") ?? "").trim();
    const body: Record<string, unknown> = { policyId, confirm: true };
    if (amountUGX) {
      const amount = wholeUgxAmount(amountUGX);
      if (!amount) {
        setMessage("Enter a valid whole-number UGX amount.");
        return;
      }
      body.amountMinor = amount;
    }
    if (period) body.periodDays = Number(period);
    if (description) body.description = description;
    if (dueDate) body.dueAt = new Date(dueDate + "T23:59:59+03:00").toISOString();
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/operator/applications/${applicationId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) {
        const messages: Record<string, string> = {
          initial_invoice_already_issued: "This application already has its first invoice.",
          application_not_approved: "Approve the application before issuing an invoice.",
          policy_unavailable: "This rent policy is unavailable in the current environment.",
          fresh_authentication_required: "Verify your account again in Security, then retry.",
          mfa_required: "Complete MFA verification in Security before issuing an invoice.",
          resource_unavailable: "Claim finance access to this application first.",
          permission_denied: "This account needs finance permission.",
          invalid_due_date: "The payment due date cannot be in the past.",
          invalid_input: "Check the invoice fields and retry.",
        };
        throw new Error(
          messages[result.error ?? ""] ??
            `Invoice could not be issued (${result.error ?? response.status}).`,
        );
      }
      setMessage("Invoice issued. Open it below to review the payment instructions.");
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invoice issuance failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="account-form" onSubmit={submit}>
      <h2>Issue first rent invoice</h2>
      <p>
        Select the agreed amount and coverage period. Issuing an invoice does not verify payment or
        activate the shop.
      </p>
      <label htmlFor="issue-rent-policy">Rent policy</label>
      <select id="issue-rent-policy" name="policyId" required defaultValue="">
        <option value="" disabled>
          Select policy and rental period
        </option>
        {policies.map((policy) => (
          <option key={policy.id} value={policy.id}>
            {policy.label} · {policy.period_days} days ·{" "}
            {formatMinorMoney(policy.amount_minor, policy.currency)}
          </option>
        ))}
      </select>
      <label htmlFor="invoice-amount-ugx">Custom amount (UGX, optional)</label>
      <input
        id="invoice-amount-ugx"
        name="amountUGX"
        type="number"
        min="1"
        max="1000000000"
        step="1"
        placeholder="Use policy amount"
      />
      <label htmlFor="invoice-period-days">Coverage (days, optional)</label>
      <input
        id="invoice-period-days"
        name="periodDays"
        type="number"
        min="1"
        max="366"
        step="1"
        placeholder="Use policy period"
      />
      <label htmlFor="invoice-due-at">Payment due date (optional)</label>
      <input id="invoice-due-at" name="dueAt" type="date" />
      <label htmlFor="invoice-description">Invoice description (optional)</label>
      <textarea id="invoice-description" name="description" maxLength={1000} rows={3} />
      <label className="checkbox-label">
        <input type="checkbox" required /> I confirm this invoice matches the agreed rent terms
      </label>
      <button className="button" disabled={pending}>
        {pending ? "Issuing invoice…" : "Issue invoice to shopkeeper"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
