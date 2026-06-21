import { performance } from "node:perf_hooks";
import { chunkDocument } from "./chunk.js";
import { resolveKnowledgeConfig } from "./config.js";
import { loadKnowledgeDocument } from "./loader.js";
import { KnowledgeRedactionError } from "./redaction.js";
import { scanKnowledgeFiles } from "./scan.js";
import { createLocalKnowledgeStore } from "./store/local.js";
import type {
  IndexIssue,
  IndexSummary,
  KnowledgeChunk,
  KnowledgeConfig,
  KnowledgeStore,
} from "./types.js";

export interface IndexKnowledgeOptions {
  config?: KnowledgeConfig;
  store?: KnowledgeStore;
  cwd?: string;
  now?: Date;
  dryRun?: boolean;
}

export async function indexKnowledge(options: IndexKnowledgeOptions = {}): Promise<IndexSummary> {
  const startedAt = performance.now();
  const config = resolveKnowledgeConfig(options.config, options.cwd);
  const store = options.store ?? createLocalKnowledgeStore({ storeDir: config.storeDir });
  const scan = await scanKnowledgeFiles(config);
  const warnings: IndexIssue[] = [...scan.warnings];
  const errors: IndexIssue[] = [...scan.errors];

  if (errors.length > 0) {
    return {
      filesScanned: scan.files.length + scan.skipped.length + scan.errors.length,
      filesIndexed: 0,
      filesSkipped: scan.skipped.length,
      chunksCreated: 0,
      chunksReused: 0,
      sourcesChanged: 0,
      sourcesDeleted: 0,
      warnings,
      errors,
      elapsedMs: Math.round(performance.now() - startedAt),
      store: await store.stats(),
    };
  }

  const existingChunks = "listChunks" in store && store.listChunks ? await store.listChunks() : [];
  const existingBySource = groupChunksBySource(existingChunks);
  const seenSources = new Set<string>();
  let chunksCreated = 0;
  let chunksReused = 0;
  let sourcesChanged = 0;
  let sourcesDeleted = 0;
  let filesIndexed = 0;
  const chunksToUpsert: KnowledgeChunk[] = [];
  const sourcesToDelete: string[] = [];

  for (const filePath of scan.files) {
    try {
      const document = await loadKnowledgeDocument(filePath, config);
      if (!document) continue;

      const chunks = chunkDocument(document, config, options.now?.toISOString());
      const existingForSource = existingBySource.get(document.source.path) ?? [];
      const reconciled = reconcileChunks(chunks, existingForSource);
      chunksReused += reconciled.reused;
      chunksCreated += reconciled.created;

      if (!options.dryRun) {
        if (chunks.length === 0) {
          sourcesToDelete.push(document.source.path);
        } else if (!reconciled.unchanged) {
          chunksToUpsert.push(...reconciled.chunks);
        }
      }
      if (!reconciled.unchanged) {
        sourcesChanged += 1;
      }
      seenSources.add(document.source.path);
      filesIndexed += 1;
    } catch (error) {
      if (error instanceof KnowledgeRedactionError) {
        const issue: IndexIssue = {
          level: error.level,
          path: error.path,
          code: "possible_secret",
          message: error.message,
        };

        if (error.level === "error") errors.push(issue);
        else warnings.push(issue);
        continue;
      }

      errors.push({
        level: "error",
        path: filePath,
        code: "load_failed",
        message: error instanceof Error ? error.message : "Failed to load knowledge file.",
      });
    }
  }

  if ("listSources" in store && store.listSources) {
    const previousSources = await store.listSources();
    for (const sourcePath of previousSources.filter((sourcePath) => !seenSources.has(sourcePath))) {
      sourcesDeleted += 1;
      if (!options.dryRun) {
        sourcesToDelete.push(sourcePath);
      }
    }
  }

  if (!options.dryRun) {
    if (chunksToUpsert.length > 0) {
      await store.upsertChunks(chunksToUpsert);
    }
    for (const sourcePath of sourcesToDelete) {
      await store.deleteBySource(sourcePath);
    }
  }

  return {
    filesScanned: scan.files.length + scan.skipped.length,
    filesIndexed,
    filesSkipped: scan.skipped.length + warnings.length,
    chunksCreated,
    chunksReused,
    sourcesChanged,
    sourcesDeleted,
    warnings,
    errors,
    elapsedMs: Math.round(performance.now() - startedAt),
    store: await store.stats(),
  };
}

interface ReconciledChunks {
  chunks: KnowledgeChunk[];
  reused: number;
  created: number;
  unchanged: boolean;
}

function reconcileChunks(chunks: KnowledgeChunk[], existingChunks: KnowledgeChunk[]): ReconciledChunks {
  const existingById = new Map(existingChunks.map((chunk) => [chunk.id, chunk]));
  let reused = 0;
  let created = 0;

  const reconciled = chunks.map((chunk) => {
    const existing = existingById.get(chunk.id);
    if (existing?.contentHash === chunk.contentHash) {
      reused += 1;
      return mergeReusedChunk(chunk, existing);
    }

    created += 1;
    return chunk;
  });

  return {
    chunks: reconciled,
    reused,
    created,
    unchanged: isSameChunkSet(reconciled, existingChunks),
  };
}

function mergeReusedChunk(chunk: KnowledgeChunk, existing: KnowledgeChunk): KnowledgeChunk {
  return {
    ...chunk,
    source: sameSourceExceptModifiedTime(chunk, existing) ? existing.source : chunk.source,
    indexedAt: existing.indexedAt,
  };
}

function sameSourceExceptModifiedTime(next: KnowledgeChunk, existing: KnowledgeChunk): boolean {
  const { modifiedTime: _nextModifiedTime, ...nextSource } = next.source;
  const { modifiedTime: _existingModifiedTime, ...existingSource } = existing.source;
  return JSON.stringify(nextSource) === JSON.stringify(existingSource);
}

function isSameChunkSet(nextChunks: KnowledgeChunk[], existingChunks: KnowledgeChunk[]): boolean {
  if (nextChunks.length !== existingChunks.length) return false;

  const existingById = new Map(existingChunks.map((chunk) => [chunk.id, chunk]));

  return nextChunks.every((chunk) => {
    const existing = existingById.get(chunk.id);
    return existing !== undefined && JSON.stringify(existing) === JSON.stringify(chunk);
  });
}

function groupChunksBySource(chunks: KnowledgeChunk[]): Map<string, KnowledgeChunk[]> {
  const grouped = new Map<string, KnowledgeChunk[]>();

  for (const chunk of chunks) {
    const group = grouped.get(chunk.source.path) ?? [];
    group.push(chunk);
    grouped.set(chunk.source.path, group);
  }

  return grouped;
}
