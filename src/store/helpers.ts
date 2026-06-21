import type { Citation, KnowledgeChunk, MetadataFilter } from "../types.js";

export function replaceChunksBySource(existing: KnowledgeChunk[], incoming: KnowledgeChunk[]): KnowledgeChunk[] {
  const incomingSourcePaths = new Set(incoming.map((chunk) => chunk.source.path));
  const incomingIds = new Set(incoming.map((chunk) => chunk.id));
  return [
    ...existing.filter(
      (chunk) => !incomingSourcePaths.has(chunk.source.path) && !incomingIds.has(chunk.id),
    ),
    ...incoming,
  ].sort((a, b) => a.id.localeCompare(b.id));
}

export function removeChunksBySource(chunks: KnowledgeChunk[], sourcePath: string): KnowledgeChunk[] {
  return chunks.filter((chunk) => chunk.source.path !== sourcePath);
}

export function citationForChunk(chunk: KnowledgeChunk): Citation {
  return {
    path: chunk.source.path,
    chunkId: chunk.id,
    indexedAt: chunk.indexedAt,
    ...(chunk.headingPath.length > 0 ? { heading: chunk.headingPath.join(" > ") } : {}),
  };
}

export function countSources(chunks: KnowledgeChunk[]): number {
  return listSourcePaths(chunks).length;
}

export function listSourcePaths(chunks: KnowledgeChunk[]): string[] {
  return [...new Set(chunks.map((chunk) => chunk.source.path))].sort();
}

export function matchesMetadataFilters(chunk: KnowledgeChunk, filters?: MetadataFilter): boolean {
  if (!filters) return true;

  for (const [key, expected] of Object.entries(filters)) {
    const actual = chunk.source.metadata[key];
    if (actual === undefined) return false;

    const expectedValues = Array.isArray(expected) ? expected : [expected];
    const actualValues = Array.isArray(actual) ? actual : [actual];

    if (!expectedValues.some((value) => actualValues.includes(value))) {
      return false;
    }
  }

  return true;
}
