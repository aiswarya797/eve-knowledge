import { indexKnowledge } from "./indexer.js";
import type { IndexIssue, IndexSummary, KnowledgeConfig, KnowledgeStore } from "./types.js";

export interface CheckKnowledgeOptions {
  config?: KnowledgeConfig;
  store?: KnowledgeStore;
  cwd?: string;
  production?: boolean;
}

export interface CheckKnowledgeResult {
  ok: boolean;
  summary: IndexSummary;
  issues: IndexIssue[];
}

export async function checkKnowledge(options: CheckKnowledgeOptions = {}): Promise<CheckKnowledgeResult> {
  const store = options.store;
  const summary = await indexKnowledge({
    ...(options.cwd ? { cwd: options.cwd } : {}),
    config: {
      ...options.config,
      redaction: {
        ...options.config?.redaction,
        mode: "fail",
      },
    },
    ...(store ? { store } : {}),
    dryRun: true,
  });
  const issues: IndexIssue[] = [...summary.errors];

  if (summary.sourcesChanged > 0 || summary.sourcesDeleted > 0) {
    issues.push({
      level: "error",
      code: "stale_index",
      message: `${summary.sourcesChanged} sources changed and ${summary.sourcesDeleted} sources were deleted. Run eve-knowledge index before shipping.`,
    });
  }

  if (options.production) {
    const durability = options.store?.durability ?? summary.store.durability;
    if (durability !== "durable") {
      issues.push({
        level: "error",
        code: "non_durable_store",
        message: "Production checks require a durable KnowledgeStore. Local filesystem storage is not durable in serverless deployments.",
      });
    }
  }

  return {
    ok: issues.length === 0,
    summary,
    issues,
  };
}
