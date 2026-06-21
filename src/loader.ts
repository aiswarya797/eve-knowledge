import fs from "node:fs/promises";
import path from "node:path";
import { toRepoPath } from "./fs-utils.js";
import { parse as parseYaml } from "yaml";
import { parseFrontmatter, normalizeMetadata } from "./frontmatter.js";
import { detectKnowledgeFormat } from "./format.js";
import { sha256 } from "./hash.js";
import { detectSecrets, KnowledgeRedactionError } from "./redaction.js";
import { sectionFromText, splitMarkdownSections } from "./sections.js";
import type {
  DocumentMetadata,
  LoadedKnowledgeDocument,
  ResolvedKnowledgeConfig,
} from "./types.js";

export async function loadKnowledgeDocument(
  filePath: string,
  config: ResolvedKnowledgeConfig,
): Promise<LoadedKnowledgeDocument | undefined> {
  const format = detectKnowledgeFormat(filePath);
  if (!format) return undefined;

  const stat = await fs.stat(filePath);
  const content = await fs.readFile(filePath, "utf8");
  const relativePath = toRepoPath(path.relative(config.rootDir, filePath));
  const secrets = detectSecrets(content);
  if (secrets.length > 0 && config.redaction.mode !== "off") {
    throw new KnowledgeRedactionError(
      config.redaction.mode === "fail" ? "error" : "warning",
      relativePath,
      secrets,
    );
  }

  const contentHash = sha256(content);
  const modifiedTime = stat.mtime.toISOString();
  let metadata: DocumentMetadata = {};
  let body = content;

  if (format === "markdown" || format === "mdx") {
    const parsed = parseFrontmatter(content);
    metadata = parsed.metadata;
    body = parsed.body;
  } else if (format === "json") {
    const parsed = JSON.parse(content) as unknown;
    metadata = normalizeMetadata(parsed);
    body = JSON.stringify(parsed, null, 2);
  } else if (format === "yaml") {
    const parsed = parseYaml(content);
    metadata = normalizeMetadata(parsed);
    body = parsed === null || parsed === undefined ? "" : JSON.stringify(parsed, null, 2);
  }

  return {
    source: {
      path: relativePath,
      format,
      contentHash,
      modifiedTime,
      sizeBytes: stat.size,
      metadata,
    },
    sections:
      format === "markdown" || format === "mdx"
        ? splitMarkdownSections(body)
        : sectionFromText(body),
  };
}
