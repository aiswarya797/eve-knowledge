import { indexKnowledge } from "./indexer.js";
import { searchKnowledge } from "./search.js";
import type { KnowledgeConfig } from "./types.js";

export interface EvalCase {
  name: string;
  query: string;
  expectPath?: string;
  expectNoResults?: boolean;
  filters?: Record<string, string | number | boolean | Array<string | number | boolean>>;
}

export interface EvalResult {
  name: string;
  passed: boolean;
  message: string;
}

export interface RunEvalOptions {
  cwd?: string;
  config?: KnowledgeConfig;
  cases: EvalCase[];
}

export async function runKnowledgeEvals(options: RunEvalOptions): Promise<EvalResult[]> {
  await indexKnowledge({
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.config ? { config: options.config } : {}),
  });

  const results: EvalResult[] = [];

  for (const testCase of options.cases) {
    const response = await searchKnowledge(
      {
        query: testCase.query,
        ...(testCase.filters ? { filters: testCase.filters } : {}),
      },
      {
        ...(options.cwd ? { cwd: options.cwd } : {}),
        ...(options.config ? { config: options.config } : {}),
      },
    );

    if (testCase.expectNoResults) {
      results.push({
        name: testCase.name,
        passed: response.status === "no_results",
        message:
          response.status === "no_results"
            ? "No-result behavior matched."
            : "Expected no results but received cited results.",
      });
      continue;
    }

    if (response.status === "no_results") {
      results.push({
        name: testCase.name,
        passed: false,
        message: "Expected cited results but received no_results.",
      });
      continue;
    }

    const matched = testCase.expectPath
      ? response.results.some((result) => result.citation.path === testCase.expectPath)
      : response.results.length > 0;

    results.push({
      name: testCase.name,
      passed: matched,
      message: matched ? "Expected citation found." : `Missing citation ${testCase.expectPath}.`,
    });
  }

  return results;
}
