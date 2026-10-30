import { mkdir, writeFile, link, unlink, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";

export interface NotificationAdapter {
  deliver(
    key: string,
    message: Record<string, unknown>,
    signal: AbortSignal,
    authority?: { leaseToken: string },
  ): Promise<void>;
}
export interface PrivateStorageAdapter {
  put(key: string, bytes: Uint8Array, signal: AbortSignal): Promise<void>;
}
export class LocalPrivateStorage implements PrivateStorageAdapter {
  constructor(private readonly directory = resolve(".local/notifications")) {}
  async put(key: string, bytes: Uint8Array, signal: AbortSignal) {
    if (!/^[a-f0-9-]{36}\.json$/.test(key)) throw new Error("Invalid local storage key");
    signal.throwIfAborted();
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = resolve(this.directory, `${key}.${randomUUID()}.tmp`),
      destination = resolve(this.directory, key);
    try {
      await writeFile(temporary, bytes, { flag: "wx", mode: 0o600, signal });
      signal.throwIfAborted();
      try {
        await link(temporary, destination);
      } catch (error) {
        if ((error as { code?: string }).code !== "EEXIST") throw error;
        if (!Buffer.from(bytes).equals(await readFile(destination)))
          throw new Error("Local delivery idempotency conflict", { cause: error });
      }
    } finally {
      await unlink(temporary).catch((error) => {
        if ((error as { code?: string }).code !== "ENOENT") throw error;
      });
    }
  }
}
const paymentDetails = z
  .object({
    supportEmail: z.email(),
    supportPhone: z
      .string()
      .regex(/^\+[1-9][0-9]{7,14}$/)
      .nullable(),
    mobileMoneyPhone: z
      .string()
      .regex(/^\+[1-9][0-9]{7,14}$/)
      .nullable(),
    mobileMoneyName: z.string().min(2).max(120).nullable(),
    mtnMomoPhone: z
      .string()
      .regex(/^\+[1-9][0-9]{7,14}$/)
      .nullable()
      .optional(),
    mtnMomoName: z.string().min(2).max(120).nullable().optional(),
    airtelMoneyPhone: z
      .string()
      .regex(/^\+[1-9][0-9]{7,14}$/)
      .nullable()
      .optional(),
    airtelMoneyName: z.string().min(2).max(120).nullable().optional(),
    bankName: z.string().min(2).max(120).nullable(),
    bankAccountName: z.string().min(2).max(120).nullable(),
    bankAccountNumber: z.string().min(4).max(80).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.mtnMomoPhone) !== Boolean(value.mtnMomoName))
      context.addIssue({ code: "custom", message: "mtn_pair_required" });
    if (Boolean(value.airtelMoneyPhone) !== Boolean(value.airtelMoneyName))
      context.addIssue({ code: "custom", message: "airtel_pair_required" });
  });
export const messageSchema = z.discriminatedUnion("template", [
  z
    .object({
      template: z.literal("application-review-queue"),
      to: z.email(),
      operatorId: z.string().min(1).max(128),
      applicationId: z.uuid(),
    })
    .strict(),
  z
    .object({
      template: z.literal("incident-status"),
      to: z.email(),
      caseId: z.uuid(),
      shopId: z.uuid(),
      state: z.enum(["open", "investigating", "escalated", "resolved", "cancelled"]),
    })
    .strict(),
  z
    .object({
      template: z.literal("trust-status"),
      to: z.email(),
      caseId: z.uuid(),
      shopId: z.uuid(),
      state: z.enum(["reviewing", "suspended", "dismissed", "reinstated"]),
    })
    .strict(),
  z
    .object({
      template: z.literal("application-status"),
      to: z.email(),
      applicationId: z.uuid(),
      state: z.enum(["submitted", "needs_information", "approved", "rejected"]),
    })
    .strict(),
  z
    .object({
      template: z.literal("tenancy-status"),
      to: z.email(),
      shopId: z.uuid(),
      state: z.enum(["renewal_due", "due", "grace", "closed"]),
      periodEnd: z.iso.datetime(),
      invoice: z
        .object({
          id: z.uuid(),
          reference: z.string().regex(/^LON-[A-F0-9]{32}$/),
          currency: z.enum(["UGX", "USD", "KES", "EUR", "GBP"]),
          remaining_minor: z.string().regex(/^[1-9][0-9]{0,19}$/),
        })
        .strict()
        .optional(),
      payment: paymentDetails.optional(),
    })
    .strict(),
  z
    .object({
      template: z.literal("rent-credit"),
      to: z.email(),
      invoiceId: z.uuid(),
      eventId: z.uuid(),
    })
    .strict(),
  z
    .object({
      template: z.literal("shop-welcome"),
      to: z.email(),
      shopId: z.uuid(),
      shopName: z.string().min(1).max(120),
    })
    .strict(),
  z
    .object({
      template: z.literal("monthly-report"),
      to: z.email(),
      shopId: z.uuid(),
      shopName: z.string().min(1).max(120),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      shopViews: z.string().regex(/^\d+$/),
      productViews: z.string().regex(/^\d+$/),
      contactActions: z.string().regex(/^\d+$/),
      discoveryClicks: z.string().regex(/^\d+$/),
    })
    .strict(),
  z
    .object({
      template: z.literal("campaign"),
      to: z.email(),
      campaignId: z.uuid(),
      subject: z
        .string()
        .min(3)
        .max(140)
        .regex(/^[^\r\n]+$/),
      body: z.string().min(10).max(5000),
      ctaLabel: z
        .string()
        .min(2)
        .max(50)
        .regex(/^[^\r\n]+$/)
        .optional(),
      ctaPath: z
        .string()
        .regex(/^\/[A-Za-z0-9/_?=&.-]{0,300}$/)
        .optional(),
    })
    .strict()
    .superRefine((value, context) => {
      if (Boolean(value.ctaLabel) !== Boolean(value.ctaPath))
        context.addIssue({ code: "custom", message: "cta_pair_required" });
    }),
  z
    .object({
      template: z.literal("contact-changed"),
      to: z.email(),
      shopId: z.uuid(),
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      template: z.literal("guest-request"),
      to: z.email(),
      shopId: z.uuid(),
      requestId: z.uuid(),
    })
    .strict(),
  z
    .object({
      template: z.literal("invitation"),
      to: z.email(),
      token: z.string().min(32).max(128),
    })
    .strict(),
  z
    .object({
      template: z.enum(["password-reset", "email-verification"]),
      to: z.email(),
      url: z.url().max(2048),
    })
    .strict(),
]);
export class LocalNotifications implements NotificationAdapter {
  constructor(private readonly storage: PrivateStorageAdapter = new LocalPrivateStorage()) {}
  async deliver(key: string, message: Record<string, unknown>, signal: AbortSignal) {
    const checked = messageSchema.parse(message);
    await this.storage.put(
      `${key}.json`,
      Buffer.from(JSON.stringify({ adapter: "local-private-sink", ...checked }, null, 2)),
      signal,
    );
  }
}
