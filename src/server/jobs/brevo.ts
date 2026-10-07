import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "../db/pool";
import { coreConfig } from "../config";
import { messageSchema, type NotificationAdapter } from "./adapters";

const settings = z
  .object({
    apiKey: z
      .string()
      .min(20)
      .max(1024)
      .regex(/^[^\s]+$/),
    senderEmail: z.email().max(254),
    senderName: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[^\r\n]+$/),
    baseURL: z.url(),
  })
  .strict();
export type BrevoSettings = z.infer<typeof settings>;
export function brevoSettings(baseURL = coreConfig().baseURL): BrevoSettings {
  if (process.env.LONDOS_EMAIL_PROVIDER !== "brevo") throw new Error("email_provider_unavailable");
  return settings.parse({
    apiKey: process.env.LONDOS_BREVO_API_KEY,
    senderEmail: process.env.LONDOS_EMAIL_FROM,
    senderName: process.env.LONDOS_EMAIL_FROM_NAME,
    baseURL,
  });
}
export function notificationsConfigured(config = coreConfig()) {
  try {
    if (config.localAdapters) return true;
    brevoSettings(config.baseURL);
    return true;
  } catch {
    return false;
  }
}

export function brevoMessage(message: Record<string, unknown>, origin: string) {
  const value = messageSchema.parse(message);
  let subject: string, text: string;
  const link = new URL(origin);
  if (
    !/^https?:$/.test(link.protocol) ||
    link.username ||
    link.password ||
    link.search ||
    link.hash ||
    link.pathname !== "/"
  )
    throw new Error("email_origin_invalid");
  if (value.template === "password-reset" || value.template === "email-verification") {
    const action = new URL(value.url);
    const expectedPath =
      value.template === "password-reset"
        ? /^\/api\/auth\/reset-password\/[^/]+$/
        : /^\/api\/auth\/verify-email$/;
    if (
      action.origin !== link.origin ||
      action.username ||
      action.password ||
      action.hash ||
      !expectedPath.test(action.pathname)
    )
      throw new Error("email_link_denied");
    subject =
      value.template === "password-reset"
        ? "Reset your Londos password"
        : "Verify your Londos email";
    text = `${subject}:\n${action.href}\n\nIf you did not request this, ignore this email. Never share this link.`;
  } else if (value.template === "invitation") {
    link.pathname = "/shopkeeper/invitations";
    link.searchParams.set("token", value.token);
    subject = "Londos team invitation";
    text = `A merchant invited you to their Londos team. Review the invitation after signing in:\n${link.href}`;
  } else {
    subject = "Your Londos account has an update";
    link.pathname = "/shopkeeper";
    text = `There is an update to your ${value.template.replaceAll("-", " ")} record. Sign in to Londos to review its current details:\n${link.href}\n\nLondos does not collect customer checkout payments.`;
  }
  // Plain text only; no user-controlled HTML or links from catalogue/private evidence.
  return { to: value.to, subject, text };
}

export class BrevoNotifications implements NotificationAdapter {
  constructor(
    private readonly pool: Pool,
    private readonly config: BrevoSettings = brevoSettings(),
    private readonly transport: typeof fetch = fetch,
  ) {
    settings.parse(config);
  }
  async deliver(
    key: string,
    message: Record<string, unknown>,
    signal: AbortSignal,
    authority?: { leaseToken: string },
  ) {
    z.uuid().parse(key);
    const leaseToken = z.uuid().parse(authority?.leaseToken);
    const rendered = brevoMessage(message, this.config.baseURL);
    // Reserved fictional addresses never reach the live provider.
    if (
      /\.(?:invalid|example|test|localhost)$|(?:^|\.)example\.(?:com|net|org)$/i.test(
        rendered.to.split("@")[1] ?? "",
      )
    )
      throw new Error("fictional_email_denied");
    const payload = {
      sender: { email: this.config.senderEmail, name: this.config.senderName },
      to: [{ email: rendered.to }],
      subject: rendered.subject,
      textContent: rendered.text,
      headers: { idempotencyKey: `londos-${key}` },
    };
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([messageSchema.parse(message), payload]))
      .digest("hex");
    signal.throwIfAborted();
    const start = await transaction(this.pool, async (db) => {
      const previous = (
        await db.query("SELECT fingerprint,state FROM notification_deliveries WHERE job_id=$1", [
          key,
        ])
      ).rows[0];
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new Error("delivery_payload_changed");
        if (previous.state === "accepted") return false;
        throw new Error("delivery_requires_reconciliation");
      }
      const inserted = await db.query(
        "INSERT INTO notification_deliveries(job_id,fingerprint,provider,state) SELECT id,$2,'brevo','attempting' FROM jobs WHERE id=$1 AND kind='notification.local' AND state='running' AND lease_token=$3 AND payload=$4::jsonb AND lease_until>clock_timestamp() ON CONFLICT DO NOTHING RETURNING job_id",
        [key, fingerprint, leaseToken, JSON.stringify(message)],
      );
      if (!inserted.rowCount) throw new Error("delivery_not_owned");
      return true;
    });
    if (!start) return;
    let outcome: "accepted" | "uncertain" | "rejected" = "uncertain",
      reference: string | null = null;
    try {
      signal.throwIfAborted();
      const response = await this.transport("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        headers: {
          "api-key": this.config.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (response.status >= 400 && response.status < 500) {
        outcome = "rejected";
        await response.body?.cancel().catch(() => {});
      } else if (response.status === 201) {
        // Do not retain or log error bodies, recipient identities or action tokens.
        const reader = response.body?.getReader();
        if (!reader) throw new Error("provider_response_missing");
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 8192) throw new Error("provider_response_oversized");
            chunks.push(value);
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        const result = z
          .object({
            messageId: z
              .string()
              .min(1)
              .max(256)
              .regex(/^[^\r\n]+$/),
          })
          .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        outcome = "accepted";
        reference = result.messageId;
      } else {
        await response.body?.cancel().catch(() => {});
      }
    } catch {
      /* Ambiguous network/timeout outcomes never resend automatically. */
    }
    await this.pool.query(
      "UPDATE notification_deliveries SET state=$2,provider_reference=$3,updated_at=clock_timestamp() WHERE job_id=$1 AND state='attempting'",
      [key, outcome, reference],
    );
    if (outcome !== "accepted") throw new Error("delivery_requires_reconciliation");
  }
}
