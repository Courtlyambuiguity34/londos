import { z } from "zod";
export const catalogueRetentionDays = 30;
export const catalogueKind = z.enum(["department", "product"]);
export const catalogueConfirmation = z
  .object({ version: z.number().int().positive(), confirm: z.literal(true) })
  .strict();
export const catalogueHistoryCommand = z.discriminatedUnion("action", [
  catalogueConfirmation
    .extend({ action: z.literal("restore"), kind: catalogueKind, id: z.uuid() })
    .strict(),
  catalogueConfirmation.extend({ action: z.literal("revert"), historyId: z.uuid() }).strict(),
]);
export type CatalogueKind = z.infer<typeof catalogueKind>;
export type CatalogueSnapshot = {
  data: Record<string, unknown> & { name: string; version: number };
  deletedAt: string | null;
  deletionBatch: string | null;
  purgedAt: string | null;
};
export type CatalogueHistoryItem = {
  id: string;
  entity_kind: CatalogueKind;
  entity_id: string;
  action: string;
  before_state: CatalogueSnapshot | null;
  after_state: CatalogueSnapshot;
  created_at: string;
  expires_at: string;
  actor_name: string | null;
  current_version: number | null;
  deleted: boolean;
};
export type DeletedCatalogueItem = {
  id: string;
  kind: CatalogueKind;
  name: string;
  version: number;
  deleted_at: string;
  recover_until: string;
};
export type CatalogueHistoryPage = {
  history: CatalogueHistoryItem[];
  deleted: DeletedCatalogueItem[];
  hasMore: boolean;
  hasMoreDeleted: boolean;
  offset: number;
  deletedOffset: number;
};
