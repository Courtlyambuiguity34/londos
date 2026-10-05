import { z } from "zod";
export const privacyKind = z.enum(["enquiry", "verification", "analytics", "history"]);
export const privacyRequest = z
  .object({
    action: z.literal("request"),
    key: z.uuid(),
    kind: privacyKind,
    target: z.uuid(),
    reason: z.string().trim().min(5).max(500),
    confirm: z.literal(true),
  })
  .strict();
export const privacyCancel = z
  .object({
    action: z.literal("cancel"),
    id: z.uuid(),
    version: z.number().int().positive(),
    reason: z.string().trim().min(5).max(500),
    confirm: z.literal(true),
  })
  .strict();
export const privacyOwnerCommand = z.discriminatedUnion("action", [privacyRequest, privacyCancel]);
export const privacyClaim = z
  .object({
    version: z.number().int().positive(),
    reason: z.string().trim().min(5).max(500),
    confirm: z.literal(true),
  })
  .strict();
export const privacyCommand = z
  .object({
    action: z.enum(["approve", "deny", "hold", "release", "unassign"]),
    version: z.number().int().positive(),
    reason: z.string().trim().min(5).max(500),
    explanation: z.string().trim().min(5).max(500),
    confirm: z.literal(true),
  })
  .strict();
export const exportInput = z
  .object({
    section: z.enum([
      "shops",
      "departments",
      "catalogue",
      "contacts",
      "invoices",
      "applications",
      "incidents",
      "analytics",
    ]),
    after: z.uuid().nullable().default(null),
    confirm: z.literal(true),
  })
  .strict();
export type PrivacyKind = z.infer<typeof privacyKind>;
