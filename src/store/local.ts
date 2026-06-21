import fs from "node:fs/promises";
import path from "node:path";
import { isMissingFileError } from "../fs-utils.js";
import {
  citationForChunk,
  countSources,
  listSourcePaths,
  matchesMetadataFilters,
  removeChunksBySource,
  replaceChunksBySource,
} from "./helpers.js";
import type {
  KnowledgeChunk,
  KnowledgeSearchHit,
  KnowledgeStore,
  StoreSearchInput,
  StoreStats,
} from "../types.js";

interface LocalStoreData {
  version: 1;
  chunks: KnowledgeChunk[];
}

export interface LocalKnowledgeStoreOptions {
  storeDir: string;
}

export class LocalKnowledgeStore implements KnowledgeStore {
  readonly name = "local-json";
  readonly durability = "local";

  private readonly filePath: string;
  private data?: LocalStoreData;

  constructor(options: LocalKnowledgeStoreOptions) {
    this.filePath = path.join(options.storeDir, "index.json");
  }

  async upsertChunks(chunks: KnowledgeChunk[]): Promise<void> {
    const data = await this.read();
    data.chunks = replaceChunksBySource(data.chunks, chunks);
    await this.write(data);
  }

  async deleteBySource(sourcePath: string): Promise<void> {
    const data = await this.read();
    data.chunks = removeChunksBySource(data.chunks, sourcePath);
    await this.write(data);
  }

  async search(input: StoreSearchInput): Promise<KnowledgeSearchHit[]> {
    const data = await this.read();
    const queryTokens = tokenize(input.query);
    if (queryTokens.length === 0) return [];

    return data.chunks
      .filter((chunk) => matchesMetadataFilters(chunk, input.filters))
      .map((chunk) => ({
        chunk,
        score: scoreChunk(chunk, queryTokens),
        citation: citationForChunk(chunk),
      }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score || a.chunk.source.path.localeCompare(b.chunk.source.path))
      .slice(0, input.topK);
  }

  async stats(): Promise<StoreStats> {
    const data = await this.read();
    return {
      chunks: data.chunks.length,
      sources: countSources(data.chunks),
      storePath: this.filePath,
      durability: this.durability,
    };
  }

  async listChunks(): Promise<KnowledgeChunk[]> {
    const data = await this.read();
    return [...data.chunks];
  }

  async listSources(): Promise<string[]> {
    const data = await this.read();
    return listSourcePaths(data.chunks);
  }

  private async read(): Promise<LocalStoreData> {
    if (this.data) return this.data;

    try {
      const content = await fs.readFile(this.filePath, "utf8");
      this.data = JSON.parse(content) as LocalStoreData;
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
      this.data = { version: 1, chunks: [] };
    }

    return this.data;
  }

  private async write(data: LocalStoreData): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.${Math.random()
      .toString(36)
      .slice(2)}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`);
    await fs.rename(tempPath, this.filePath);
    this.data = data;
  }
}

export function createLocalKnowledgeStore(options: LocalKnowledgeStoreOptions): LocalKnowledgeStore {
  return new LocalKnowledgeStore(options);
}

function scoreChunk(chunk: KnowledgeChunk, queryTokens: string[]): number {
  const haystack = tokenize(
    [
      chunk.text,
      chunk.headingPath.join(" "),
      chunk.source.path,
      Object.values(chunk.source.metadata).flat().join(" "),
    ].join(" "),
  );
  const haystackCounts = new Map<string, number>();

  for (const token of haystack) {
    haystackCounts.set(token, (haystackCounts.get(token) ?? 0) + 1);
  }

  let score = 0;
  for (const token of queryTokens) {
    score += haystackCounts.get(token) ?? 0;
  }

  if (queryTokens.some((token) => chunk.source.path.toLowerCase().includes(token))) {
    score += 0.25;
  }

  return score / queryTokens.length;
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}
