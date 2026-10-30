"use client";
import { useState } from "react";
export function OperatorReviewAlertControls({
  initial,
}: {
  initial: { enabled: boolean; version: number };
}) {
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section id="email-alerts" className="workspace-panel">
      <h2>Application email alerts</h2>
      <p>
        Get a short email when an application is sent for review. It links to this queue and
        contains no private verification images or business contact details. Alerts go to your
        verified account email. You can turn them off here at any time.
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={busy}
          onChange={(e) => {
            const enabled = e.target.checked;
            const previous = value;
            setValue({ ...value, enabled });
            setBusy(true);
            setMessage("");
            void fetch("/api/operator/review-alerts", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ enabled, version: value.version }),
            })
              .then(async (response) => {
                if (!response.ok)
                  throw Error(
                    response.status === 409
                      ? "This setting changed. Reload before trying again."
                      : "The setting was not saved. Verify recent MFA in Account security and try again.",
                  );
                setValue(await response.json());
                setMessage(
                  enabled
                    ? "Application alerts enabled for your account."
                    : "Application alerts turned off.",
                );
              })
              .catch((error) => {
                setValue(previous);
                setMessage(error.message);
              })
              .finally(() => setBusy(false));
          }}
        />
        Email me when applications need review
      </label>
      <p role="status" aria-label="Application alert preference">
        {message}
      </p>
    </section>
  );
}
