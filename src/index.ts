export { defineKnowledgeConfig, resolveKnowledgeConfig } from "./config.js";
export { checkKnowledge } from "./check.js";
export { loadKnowledgeConfig } from "./config-loader.js";
export { chunkDocument, createChunkId } from "./chunk.js";
export { detectKnowledgeFormat } from "./format.js";
export { indexKnowledge } from "./indexer.js";
export { parseSearchKnowledgeInput, searchKnowledgeInputSchema } from "./input.js";
export { runKnowledgeEvals } from "./evals.js";
export type { EvalCase, EvalResult, RunEvalOptions } from "./evals.js";
export { loadKnowledgeDocument } from "./loader.js";
export { toModelOutput } from "./model-output.js";
export { scanKnowledgeFiles } from "./scan.js";
export { scaffoldEveKnowledge, scaffoldFiles } from "./scaffold.js";
export { searchKnowledge } from "./search.js";
export { LocalKnowledgeStore, createLocalKnowledgeStore } from "./store/local.js";
export {
  citationForChunk,
  countSources,
  listSourcePaths,
  matchesMetadataFilters,
  removeChunksBySource,
  replaceChunksBySource,
} from "./store/helpers.js";
export { detectSecrets } from "./redaction.js";
export type {
  Citation,
  ChunkingConfig,
  DocumentMetadata,
  EmbeddingProvider,
  IndexIssue,
  IndexSummary,
  KnowledgeChunk,
  KnowledgeConfig,
  KnowledgeFileFormat,
  KnowledgeSearchHit,
  KnowledgeSearchResponse,
  KnowledgeSection,
  KnowledgeSource,
  KnowledgeStore,
  KnowledgeStoreDurability,
  MemoryConfig,
  MetadataFilter,
  RedactionConfig,
  RedactionMode,
  ResolvedKnowledgeConfig,
  SearchKnowledgeInput,
  SearchOptions,
  StoreSearchInput,
  StoreStats,
  LoadedKnowledgeDocument,
} from "./types.js";

export const version = "0.1.0";
