import { z } from "zod";

export const catalogueFilters = z
  .object({
    query: z
      .string()
      .trim()
      .max(80)
      .refine(
        (value) =>
          ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
      )
      .default(""),
    departmentId: z.uuid().nullable().default(null),
    availability: z.enum(["all", "available", "unavailable", "archived"]).default("all"),
  })
  .strict();
export const catalogueMove = z
  .object({
    kind: z.enum(["department", "product"]),
    id: z.uuid(),
    version: z.number().int().positive(),
    direction: z.enum(["up", "down"]),
  })
  .strict();
