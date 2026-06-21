import path from "node:path";
import type { KnowledgeFileFormat } from "./types.js";

export function detectKnowledgeFormat(filePath: string): KnowledgeFileFormat | undefined {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".md") return "markdown";
  if (ext === ".mdx") return "mdx";
  if (ext === ".txt") return "text";
  if (ext === ".json") return "json";
  if (ext === ".yaml" || ext === ".yml") return "yaml";

  return undefined;
}
