import type { KnowledgeSearchResponse } from "./types.js";

export interface ModelOutput {
  type: "json";
  value: unknown;
}

export function toModelOutput(output: KnowledgeSearchResponse): ModelOutput {
  if (output.status === "no_results") {
    return {
      type: "json",
      value: {
        status: output.status,
        query: output.query,
        message: output.message,
      },
    };
  }

  return {
    type: "json",
    value: {
      status: output.status,
      query: output.query,
      citations: output.results.map((result) => result.citation),
      results: output.results.slice(0, 5).map((result) => ({
        text: boundText(result.chunk.text, 800),
        score: result.score,
        citation: result.citation,
      })),
    },
  };
}

function boundText(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) return text;
  return `${text.slice(0, maxCharacters - 1).trimEnd()}...`;
}
