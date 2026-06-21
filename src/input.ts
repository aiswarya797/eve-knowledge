import { z } from "zod";
import type { SearchKnowledgeInput } from "./types.js";

const metadataPrimitiveSchema = z.union([z.string(), z.number(), z.boolean()]);

export const searchKnowledgeInputSchema = z
  .object({
    query: z.string().min(1),
    topK: z.number().int().min(1).max(20).optional(),
    filters: z.record(z.string(), z.union([metadataPrimitiveSchema, z.array(metadataPrimitiveSchema)])).optional(),
  })
  .strict();

export function parseSearchKnowledgeInput(input: unknown): SearchKnowledgeInput {
  const parsed = searchKnowledgeInputSchema.parse(input);
  return {
    query: parsed.query,
    ...(parsed.topK !== undefined ? { topK: parsed.topK } : {}),
    ...(parsed.filters !== undefined ? { filters: parsed.filters } : {}),
  };
}
