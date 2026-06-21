import { shortHash } from "./hash.js";
import type { KnowledgeChunk, LoadedKnowledgeDocument, ResolvedKnowledgeConfig } from "./types.js";

export function chunkDocument(
  document: LoadedKnowledgeDocument,
  config: Pick<ResolvedKnowledgeConfig, "chunking">,
  indexedAt = new Date().toISOString(),
): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];

  for (const section of document.sections) {
    const parts = splitText(section.text, config.chunking.maxCharacters, config.chunking.overlapCharacters);

    parts.forEach((text, partIndex) => {
      const contentHash = shortHash(text, 32);
      const ordinal = chunks.length;
      chunks.push({
        id: createChunkId(document.source.path, section.headingPath, section.ordinal, partIndex, contentHash),
        source: document.source,
        text,
        headingPath: section.headingPath,
        ordinal,
        contentHash,
        tokenCount: estimateTokenCount(text),
        charCount: text.length,
        indexedAt,
      });
    });
  }

  return chunks;
}

export function createChunkId(
  sourcePath: string,
  headingPath: string[],
  sectionOrdinal: number,
  partOrdinal: number,
  contentHash: string,
): string {
  return `chk_${shortHash(
    [sourcePath, headingPath.join(" > "), sectionOrdinal, partOrdinal, contentHash].join("\n"),
    24,
  )}`;
}

function splitText(text: string, maxCharacters: number, overlapCharacters: number): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= maxCharacters) return [normalized];

  const parts: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const hardEnd = Math.min(start + maxCharacters, normalized.length);
    const end = chooseBreak(normalized, start, hardEnd);
    const part = normalized.slice(start, end).trim();

    if (part) parts.push(part);
    if (end >= normalized.length) break;

    start = Math.max(end - overlapCharacters, start + 1);
  }

  return parts;
}

function chooseBreak(text: string, start: number, hardEnd: number): number {
  if (hardEnd >= text.length) return text.length;

  const window = text.slice(start, hardEnd);
  const paragraphBreak = window.lastIndexOf("\n\n");
  if (paragraphBreak > Math.floor(window.length * 0.5)) {
    return start + paragraphBreak;
  }

  const sentenceBreak = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
  if (sentenceBreak > Math.floor(window.length * 0.5)) {
    return start + sentenceBreak + 1;
  }

  const wordBreak = window.lastIndexOf(" ");
  if (wordBreak > Math.floor(window.length * 0.5)) {
    return start + wordBreak;
  }

  return hardEnd;
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
