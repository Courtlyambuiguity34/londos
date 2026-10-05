import { z } from "zod";
export const publicEvent = z.enum([
  "mall_visit",
  "search_submitted",
  "search_results_viewed",
  "shop_result_clicked",
  "shop_viewed",
  "department_viewed",
  "product_viewed",
  "contact_action_clicked",
  "direct_link_entry",
]);
export const attribution = z.enum(["direct", "discovery", "unattributed"]);
export const contactChannel = z.enum(["call", "whatsapp", "enquiry", "website"]);
export const pilotContext = z
  .object({
    page: z.enum(["mall", "search", "shop", "department", "product", "contact"]),
    shopId: z.uuid().nullable(),
    departmentId: z.uuid().nullable(),
    productId: z.uuid().nullable(),
    shops: z.array(z.uuid()).max(20),
    resultCount: z.number().int().min(0).max(20),
    globalDiscovery: z.boolean(),
    channels: z.array(contactChannel).max(4),
  })
  .strict();
export type PilotContext = z.infer<typeof pilotContext>;
export const captureInput = z
  .object({
    token: z.string().min(10).max(4096),
    event: publicEvent,
    target: z.uuid().nullable(),
    source: attribution.nullable(),
    channel: contactChannel.nullable(),
  })
  .strict();
export type CaptureInput = z.infer<typeof captureInput>;
