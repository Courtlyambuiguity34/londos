import { z } from "zod";
const reason = z.string().trim().min(5).max(500);
export const costWindow = z.union([z.literal(7), z.literal(30), z.literal(90)]);
export const costCursor = z.uuid().nullable().default(null);
export const costClaim = z
  .object({ shopVersion: z.number().int().positive(), reason, confirm: z.literal(true) })
  .strict();
const base = { key: z.uuid(), version: z.number().int().min(0), reason, confirm: z.literal(true) };
export const costCommand = z.discriminatedUnion("action", [
  z
    .object({
      ...base,
      action: z.literal("record"),
      category: z.enum(["support", "verification", "rent_collection"]),
      workDay: z.iso.date(),
      minutes: z.number().int().min(0).max(480),
      expenseMinor: z.number().int().min(0).max(1000000000),
      currency: z.literal("UGX"),
    })
    .strict()
    .refine((v) => v.minutes > 0 || v.expenseMinor > 0, { message: "Record time or an expense." }),
  z.object({ ...base, action: z.literal("reverse"), originalId: z.uuid() }).strict(),
]);
