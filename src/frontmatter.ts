import { parse as parseYaml } from "yaml";
import type { DocumentMetadata, MetadataPrimitive } from "./types.js";

export interface FrontmatterResult {
  body: string;
  metadata: DocumentMetadata;
}

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(content: string): FrontmatterResult {
  const match = frontmatterPattern.exec(content);
  if (!match) {
    return { body: content, metadata: {} };
  }

  const yamlText = match[1] ?? "";
  const parsed = parseYaml(yamlText);

  return {
    body: content.slice(match[0].length),
    metadata: normalizeMetadata(parsed),
  };
}

export function normalizeMetadata(value: unknown): DocumentMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const metadata: DocumentMetadata = {};

  for (const [key, rawValue] of Object.entries(value)) {
    const normalized = normalizeMetadataValue(rawValue);
    if (normalized !== undefined) {
      metadata[key] = normalized;
    }
  }

  return metadata;
}

function normalizeMetadataValue(
  value: unknown,
): MetadataPrimitive | MetadataPrimitive[] | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const normalized = value.filter(isMetadataPrimitive);
    return normalized.length > 0 ? normalized : undefined;
  }

  return undefined;
}

function isMetadataPrimitive(value: unknown): value is MetadataPrimitive {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
