"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { listCommunications } from "@/server/communications";
import { WorkspaceSectionNav, useWorkspaceSection } from "./workspace-sections";
const sections = [
  { id: "payments", label: "Payment details", description: "Collection & support" },
  { id: "campaigns", label: "Email campaigns", description: "Compose & review" },
  { id: "promotions", label: "Promotions", description: "Offers & history" },
] as const;
import { campaignCtaError } from "@/modules/communications/cta";

type Data = Awaited<ReturnType<typeof listCommunications>>;

async function send(path: string, method: string, body: unknown) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "request_failed");
  return result;
}

export function CommunicationsControls({ initial }: { initial: Data }) {
  const router = useRouter();
  const { active, select } = useWorkspaceSection(sections, "payments");
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  async function work(task: () => Promise<unknown>, success: string) {
    setPending(true);
    setMessage("");
    try {
      await task();
      setMessage(success);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `The change was not saved (${error.message.replaceAll("_", " ")}).`
          : "The change was not saved.",
      );
    } finally {
      setPending(false);
    }
  }
  async function paymentSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await work(
      () =>
        send("/api/operator/payment-settings", "PUT", {
          version: initial.paymentSettings?.version ?? 0,
          supportEmail: String(form.get("supportEmail")),
          supportPhone: String(form.get("supportPhone")),
          mobileMoneyPhone: String(form.get("mobileMoneyPhone")),
          mobileMoneyName: String(form.get("mobileMoneyName")),
          mtnMomoPhone: String(form.get("mtnMomoPhone")),
          mtnMomoName: String(form.get("mtnMomoName")),
          airtelMoneyPhone: String(form.get("airtelMoneyPhone")),
          airtelMoneyName: String(form.get("airtelMoneyName")),
          bankName: String(form.get("bankName")),
          bankAccountName: String(form.get("bankAccountName")),
          bankAccountNumber: String(form.get("bankAccountNumber")),
          notifyShops: form.get("notifyShops") === "on",
          confirm: form.get("confirm") === "on",
        }),
      "Payment instructions updated.",
    );
  }
  async function campaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      audience = String(form.get("audience")),
      ctaLabel = String(form.get("ctaLabel") ?? "").trim(),
      ctaPath = String(form.get("ctaPath") ?? "").trim();
    const ctaError = campaignCtaError(ctaLabel, ctaPath);
    if (ctaError) {
      setMessage(ctaError);
      return;
    }
    await work(
      () =>
        send("/api/operator/communications", "POST", {
          subject: String(form.get("subject")),
          body: String(form.get("body")),
          audience,
          ...(audience === "new_shops" ? { newShopDays: Number(form.get("newShopDays")) } : {}),
          ...(audience === "specific_shops" ? { shopIds: form.getAll("shopIds").map(String) } : {}),
          ...(ctaLabel && ctaPath ? { ctaLabel, ctaPath } : {}),
          confirm: form.get("confirm") === "on",
        }),
      "Campaign queued. Delivery will obey the configured Brevo limits.",
    );
  }
  async function promotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      benefit = String(form.get("benefit")),
      audience = String(form.get("audience"));
    await work(
      () =>
        send("/api/operator/promotions", "POST", {
          code: String(form.get("code")),
          title: String(form.get("title")),
          description: String(form.get("description")),
          benefit,
          ...(benefit === "percentage" ? { percentOff: Number(form.get("percentOff")) } : {}),
          ...(benefit === "fixed"
            ? { fixedMinor: String(form.get("fixedMinor")), currency: "UGX" }
            : {}),
          audience,
          ...(audience === "specific_merchants"
            ? { merchantIds: form.getAll("merchantIds").map(String) }
            : {}),
          startsAt: new Date(String(form.get("startsAt"))).toISOString(),
          endsAt: new Date(String(form.get("endsAt"))).toISOString(),
          ...(form.get("maxRedemptions")
            ? { maxRedemptions: Number(form.get("maxRedemptions")) }
            : {}),
          announce: form.get("announce") === "on",
          confirm: form.get("confirm") === "on",
        }),
      "Promotion created.",
    );
  }
  const settings = initial.paymentSettings;
  return (
    <div className="lifecycle-panel communications-workspace">
      <WorkspaceSectionNav
        items={sections}
        active={active}
        select={select}
        label="Communications tools"
      />
      <p role="status">{pending ? "Saving…" : message}</p>
      <section
        id="payments"
        role="tabpanel"
        aria-label="Payment details"
        hidden={active !== "payments"}
      >
        <form
          className="account-form editor-form-grid"
          onSubmit={(event) => void paymentSettings(event)}
        >
          <h2>Payment and support details</h2>
          <p>These details appear only in authenticated merchant billing views and rent emails.</p>
          <div className="editor-form-field">
            <label htmlFor="support-email">Support email</label>
            <input
              id="support-email"
              name="supportEmail"
              type="email"
              required
              defaultValue={settings?.support_email}
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="support-phone">Support phone (optional)</label>
            <input
              id="support-phone"
              name="supportPhone"
              type="tel"
              pattern="\+[1-9][0-9]{7,14}"
              defaultValue={settings?.support_phone ?? ""}
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="mobile-money-phone">Mobile money phone</label>
            <input
              id="mobile-money-phone"
              name="mobileMoneyPhone"
              type="tel"
              pattern="\+[1-9][0-9]{7,14}"
              defaultValue={settings?.mobile_money_phone ?? ""}
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="mobile-money-name">Mobile money registered name</label>
            <input
              id="mobile-money-name"
              name="mobileMoneyName"
              maxLength={120}
              defaultValue={settings?.mobile_money_name ?? ""}
            />
          </div>
          <h3>MTN MoMo account</h3>
          <div className="editor-form-field">
            <label htmlFor="mtn-momo-phone">MTN collection number</label>
            <input
              id="mtn-momo-phone"
              name="mtnMomoPhone"
              type="tel"
              pattern="\+[1-9][0-9]{7,14}"
              defaultValue={settings?.mtn_momo_phone ?? ""}
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="mtn-momo-name">MTN registered account name</label>
            <input
              id="mtn-momo-name"
              name="mtnMomoName"
              maxLength={120}
              defaultValue={settings?.mtn_momo_name ?? ""}
            />
          </div>
          <h3>Airtel Money account</h3>
          <div className="editor-form-field">
            <label htmlFor="airtel-money-phone">Airtel collection number</label>
            <input
              id="airtel-money-phone"
              name="airtelMoneyPhone"
              type="tel"
              pattern="\+[1-9][0-9]{7,14}"
              defaultValue={settings?.airtel_money_phone ?? ""}
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="airtel-money-name">Airtel registered account name</label>
            <input
              id="airtel-money-name"
              name="airtelMoneyName"
              maxLength={120}
              defaultValue={settings?.airtel_money_name ?? ""}
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="bank-name">Bank name (optional)</label>
            <input
              id="bank-name"
              name="bankName"
              maxLength={120}
              defaultValue={settings?.bank_name ?? ""}
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="bank-account-name">Bank account name</label>
            <input
              id="bank-account-name"
              name="bankAccountName"
              maxLength={120}
              defaultValue={settings?.bank_account_name ?? ""}
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="bank-account-number">Bank account number</label>
            <input
              id="bank-account-number"
              name="bankAccountNumber"
              maxLength={80}
              defaultValue={settings?.bank_account_number ?? ""}
            />
          </div>
          <label className="checkbox-label">
            <input type="checkbox" name="notifyShops" /> Queue an email to current shop owners
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="confirm" required /> I verified these payment details and
            understand incorrect details could direct funds incorrectly
          </label>
          <button className="button" disabled={pending}>
            Save payment details
          </button>
        </form>
      </section>
      <section
        id="campaigns"
        role="tabpanel"
        aria-label="Email campaigns"
        hidden={active !== "campaigns"}
      >
        <form className="account-form editor-form-grid" onSubmit={(event) => void campaign(event)}>
          <h2>Send a branded Londos email</h2>
          <p>
            Text is escaped into the Londos HTML template. Raw HTML and external action URLs are not
            accepted.
          </p>
          <div className="editor-form-field">
            <label htmlFor="campaign-subject">Subject</label>
            <input id="campaign-subject" name="subject" minLength={3} maxLength={140} required />
          </div>
          <div className="editor-form-field">
            <label htmlFor="campaign-body">Message</label>
            <textarea
              id="campaign-body"
              name="body"
              minLength={10}
              maxLength={5000}
              required
              rows={8}
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="campaign-audience">Audience</label>
            <select id="campaign-audience" name="audience" defaultValue="all_shops">
              <option value="all_shops">All current shops</option>
              <option value="new_shops">Recently created shops</option>
              <option value="specific_shops">Selected shops</option>
            </select>
          </div>
          <div className="editor-form-field">
            <label htmlFor="new-shop-days">Recent shop window in days</label>
            <input
              id="new-shop-days"
              name="newShopDays"
              type="number"
              min={1}
              max={365}
              defaultValue={30}
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="campaign-shops">Selected shops (Ctrl/Cmd-click for several)</label>
            <select
              id="campaign-shops"
              name="shopIds"
              multiple
              size={Math.min(8, Math.max(3, initial.shops.length))}
            >
              {initial.shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </div>
          <div className="editor-form-field">
            <label htmlFor="cta-label">Optional button label</label>
            <input id="cta-label" name="ctaLabel" maxLength={50} />
          </div>
          <div className="editor-form-field">
            <label htmlFor="cta-path">Optional Londos path</label>
            <input
              id="cta-path"
              name="ctaPath"
              placeholder="/shopkeeper"
              aria-describedby="campaign-link-help"
              maxLength={301}
            />
          </div>
          <p id="campaign-link-help">
            Use a path on Londos, for example /shopkeeper or /shopkeeper/applications. Add both
            fields for a button. Check that the destination exists and is available to your
            recipients before queuing.
          </p>
          <label className="checkbox-label">
            <input type="checkbox" name="confirm" required /> Queue this message for the selected
            audience
          </label>
          <button className="button" disabled={pending}>
            Queue campaign
          </button>
        </form>

        <h2>Recent campaigns</h2>
        <ul className="workspace-list">
          {initial.campaigns.map((campaign) => (
            <li key={campaign.id}>
              <strong>{campaign.subject}</strong>
              <span>
                {campaign.state} · {campaign.recipient_count} recipients
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section
        id="promotions"
        role="tabpanel"
        aria-label="Promotions"
        hidden={active !== "promotions"}
      >
        <form className="account-form editor-form-grid" onSubmit={(event) => void promotion(event)}>
          <h2>Create a promotion</h2>
          <div className="editor-form-field">
            <label htmlFor="promo-code">Promo code</label>
            <input id="promo-code" name="code" pattern="[A-Za-z0-9][A-Za-z0-9_-]{3,31}" required />
          </div>
          <div className="editor-form-field">
            <label htmlFor="promo-title">Title</label>
            <input id="promo-title" name="title" minLength={3} maxLength={100} required />
          </div>
          <div className="editor-form-field">
            <label htmlFor="promo-description">Description</label>
            <textarea
              id="promo-description"
              name="description"
              minLength={10}
              maxLength={500}
              required
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="promo-benefit">Benefit</label>
            <select id="promo-benefit" name="benefit" defaultValue="free_period">
              <option value="free_period">One invoice period free</option>
              <option value="percentage">Percentage discount</option>
              <option value="fixed">Fixed UGX discount</option>
            </select>
          </div>
          <div className="editor-form-field">
            <label htmlFor="percent-off">Percentage off</label>
            <input
              id="percent-off"
              name="percentOff"
              type="number"
              min={1}
              max={100}
              defaultValue={10}
            />
          </div>
          <div className="editor-form-field">
            <label htmlFor="fixed-minor">Fixed UGX amount</label>
            <input id="fixed-minor" name="fixedMinor" inputMode="numeric" pattern="[1-9][0-9]*" />
          </div>
          <div className="editor-form-field">
            <label htmlFor="promo-audience">Eligibility</label>
            <select id="promo-audience" name="audience" defaultValue="new_shops">
              <option value="new_shops">New shop applications after the promotion starts</option>
              <option value="all_shops">All eligible merchants</option>
              <option value="specific_merchants">Selected merchants</option>
            </select>
          </div>
          <div className="editor-form-field">
            <label htmlFor="promo-merchants">Selected merchants</label>
            <select
              id="promo-merchants"
              name="merchantIds"
              multiple
              size={Math.min(8, Math.max(3, initial.shops.length))}
            >
              {[...new Map(initial.shops.map((shop) => [shop.merchant_id, shop])).values()].map(
                (shop) => (
                  <option key={shop.merchant_id} value={shop.merchant_id}>
                    {shop.name}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="editor-form-field">
            <label htmlFor="promo-start">Starts</label>
            <input id="promo-start" name="startsAt" type="datetime-local" required />
          </div>
          <div className="editor-form-field">
            <label htmlFor="promo-end">Ends</label>
            <input id="promo-end" name="endsAt" type="datetime-local" required />
          </div>
          <div className="editor-form-field">
            <label htmlFor="promo-limit">Maximum redemptions (optional)</label>
            <input id="promo-limit" name="maxRedemptions" type="number" min={1} max={1000000} />
          </div>
          <label className="checkbox-label">
            <input type="checkbox" name="announce" /> Announce using a queued Londos email
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="confirm" required /> Activate this promotion with the
            stated limits
          </label>
          <button className="button" disabled={pending}>
            Create promotion
          </button>
        </form>

        <h2>Promotions</h2>
        <ul className="workspace-list">
          {initial.promotions.map((promotion) => (
            <li key={promotion.id}>
              <strong>
                {promotion.code} · {promotion.title}
              </strong>
              <span>
                {promotion.active ? "active" : "inactive"} · {promotion.redemptions} redemptions
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
