export type KnowledgeFileFormat = "markdown" | "mdx" | "text" | "json" | "yaml";

export type MetadataPrimitive = string | number | boolean;
export type DocumentMetadata = Record<string, MetadataPrimitive | MetadataPrimitive[]>;

export interface KnowledgeSource {
  path: string;
  format: KnowledgeFileFormat;
  contentHash: string;
  modifiedTime: string;
  sizeBytes: number;
  metadata: DocumentMetadata;
}

export interface KnowledgeSection {
  text: string;
  headingPath: string[];
  ordinal: number;
}

export interface LoadedKnowledgeDocument {
  source: KnowledgeSource;
  sections: KnowledgeSection[];
}

export interface Citation {
  path: string;
  heading?: string;
  chunkId: string;
  indexedAt: string;
}

export interface KnowledgeChunk {
  id: string;
  source: KnowledgeSource;
  text: string;
  headingPath: string[];
  ordinal: number;
  contentHash: string;
  tokenCount: number;
  charCount: number;
  indexedAt: string;
}

export type MetadataFilter = Record<string, MetadataPrimitive | MetadataPrimitive[]>;

export interface StoreSearchInput {
  query: string;
  topK: number;
  filters?: MetadataFilter;
}

export interface KnowledgeSearchHit {
  chunk: KnowledgeChunk;
  score: number;
  citation: Citation;
}

export type KnowledgeSearchResponse =
  | {
      status: "results";
      query: string;
      results: KnowledgeSearchHit[];
    }
  | {
      status: "no_results";
      query: string;
      message: string;
    };

export interface SearchKnowledgeInput {
  query: string;
  topK?: number;
  filters?: MetadataFilter;
}

export interface SearchOptions {
  maxResults?: number;
  maxSnippetCharacters?: number;
}

export type KnowledgeStoreDurability = "ephemeral" | "local" | "durable";

export interface StoreStats {
  chunks: number;
  sources: number;
  storePath?: string;
  durability: KnowledgeStoreDurability;
}

export interface KnowledgeStore {
  readonly name: string;
  readonly durability: KnowledgeStoreDurability;
  upsertChunks(chunks: KnowledgeChunk[]): Promise<void>;
  deleteBySource(sourcePath: string): Promise<void>;
  search(input: StoreSearchInput): Promise<KnowledgeSearchHit[]>;
  stats(): Promise<StoreStats>;
  listChunks?(): Promise<KnowledgeChunk[]>;
  listSources?(): Promise<string[]>;
  close?(): Promise<void>;
}

export interface EmbeddingProvider {
  readonly name: string;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface ChunkingConfig {
  maxCharacters: number;
  overlapCharacters: number;
}

export type RedactionMode = "warn" | "fail" | "off";

export interface RedactionConfig {
  mode: RedactionMode;
}

export interface MemoryConfig {
  enabled: false;
}

export interface KnowledgeConfig {
  rootDir?: string;
  agentDir?: string;
  knowledgeDir?: string;
  storeDir?: string;
  include?: string[];
  ignore?: string[];
  maxFileBytes?: number;
  chunking?: Partial<ChunkingConfig>;
  redaction?: Partial<RedactionConfig>;
  memory?: MemoryConfig;
}

export interface ResolvedKnowledgeConfig {
  rootDir: string;
  agentDir: string;
  knowledgeDir: string;
  storeDir: string;
  include: string[];
  ignore: string[];
  maxFileBytes: number;
  chunking: ChunkingConfig;
  redaction: RedactionConfig;
  memory: MemoryConfig;
}

export type IndexIssueLevel = "info" | "warning" | "error";

export interface IndexIssue {
  level: IndexIssueLevel;
  path?: string;
  code: string;
  message: string;
}

export interface IndexSummary {
  filesScanned: number;
  filesIndexed: number;
  filesSkipped: number;
  chunksCreated: number;
  chunksReused: number;
  sourcesChanged: number;
  sourcesDeleted: number;
  warnings: IndexIssue[];
  errors: IndexIssue[];
  elapsedMs: number;
  store: StoreStats;
}
