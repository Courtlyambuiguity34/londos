"use client";
import { useSyncExternalStore, useState, type FormEvent } from "react";
const subscribeHydration = () => () => {};
export function GuestRequestForm({
  shopId,
  productId = null,
}: {
  shopId: string;
  productId?: string | null;
}) {
  const ready = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const [key, setKey] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      requestKey = key ?? crypto.randomUUID();
    setKey(requestKey);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/guest/shops/${shopId}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: requestKey,
          kind: data.get("kind"),
          name: data.get("name"),
          replyTo: data.get("reply"),
          message: data.get("message"),
          productId,
        }),
      });
      if (!response.ok) {
        setMessage(
          response.status === 429
            ? "This shop is receiving too many requests. Try again later or use its contact number."
            : response.status === 409
              ? "The previous request changed. Select “Start another request” before submitting new details."
              : "The request was not received. Check your details and whether the shop is still available.",
        );
        return;
      }
      setMessage(
        "Request received. The shop must confirm any order, payment or reservation with you.",
      );
    } catch {
      setMessage("Delivery was not confirmed. Try again with the same details.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="account-form"
      method="post"
      action={`/api/guest/shops/${shopId}/requests`}
      onSubmit={submit}
    >
      <noscript>
        <p>
          Sending an enquiry requires JavaScript. Use the shop’s call, WhatsApp or website options
          to ask directly.
        </p>
      </noscript>
      <fieldset className="guest-request-fields" disabled={!ready}>
        <legend className="sr-only">Your enquiry</legend>
        <label htmlFor="guest-kind">Request type</label>
        <select id="guest-kind" name="kind">
          <option value="enquiry">Enquiry</option>
          <option value="request">Order request</option>
          <option value="reservation">Reservation request</option>
        </select>
        <label htmlFor="guest-name">Your name</label>
        <input id="guest-name" name="name" required maxLength={80} />
        <label htmlFor="guest-reply">Email or international phone number</label>
        <input id="guest-reply" name="reply" required maxLength={254} />
        <label htmlFor="guest-message">Message to the shop</label>
        <textarea id="guest-message" name="message" required maxLength={2000} />
        {productId ? (
          <p>
            Include quantity, size or other options, and when you need it. Do not include payment
            credentials.
          </p>
        ) : null}
        <p>
          Share only the details this shop needs to respond. A request does not confirm an order,
          payment or stock reservation.
        </p>
        <button className="button" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => {
            setKey(null);
            setMessage("Ready for another request.");
          }}
        >
          Start another request
        </button>
        <p role="status">{message}</p>
      </fieldset>
    </form>
  );
}
