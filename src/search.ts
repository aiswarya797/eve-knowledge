import { resolveKnowledgeConfig } from "./config.js";
import { createLocalKnowledgeStore } from "./store/local.js";
import type {
  KnowledgeConfig,
  KnowledgeSearchResponse,
  KnowledgeStore,
  SearchKnowledgeInput,
} from "./types.js";

export interface SearchKnowledgeOptions {
  config?: KnowledgeConfig;
  store?: KnowledgeStore;
  cwd?: string;
  maxResults?: number;
}

export async function searchKnowledge(
  input: SearchKnowledgeInput,
  options: SearchKnowledgeOptions = {},
): Promise<KnowledgeSearchResponse> {
  const config = resolveKnowledgeConfig(options.config, options.cwd);
  const store = options.store ?? createLocalKnowledgeStore({ storeDir: config.storeDir });
  const topK = Math.min(Math.max(input.topK ?? options.maxResults ?? 5, 1), 20);
  const results = await store.search({
    query: input.query,
    topK,
    ...(input.filters ? { filters: input.filters } : {}),
  });

  if (results.length === 0) {
    return {
      status: "no_results",
      query: input.query,
      message:
        "No relevant knowledge results were found. Do not fabricate an answer; ask for source material or say you do not know.",
    };
  }

  return {
    status: "results",
    query: input.query,
    results,
  };
}
