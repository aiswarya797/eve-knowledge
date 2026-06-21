import fs from "node:fs/promises";
import path from "node:path";
import {
  citationForChunk,
  countSources,
  listSourcePaths,
  matchesMetadataFilters,
  removeChunksBySource,
  replaceChunksBySource,
} from "eve-knowledge";
import type {
  KnowledgeChunk,
  KnowledgeSearchHit,
  KnowledgeStore,
  StoreSearchInput,
  StoreStats,
} from "eve-knowledge";

export class FileBackedDurableRecipeStore implements KnowledgeStore {
  readonly name = "file-backed-durable-recipe";
  readonly durability = "durable";

  constructor(private readonly filePath: string) {}

  async upsertChunks(chunks: KnowledgeChunk[]): Promise<void> {
    await this.writeChunks(replaceChunksBySource(await this.readChunks(), chunks));
  }

  async deleteBySource(sourcePath: string): Promise<void> {
    await this.writeChunks(removeChunksBySource(await this.readChunks(), sourcePath));
  }

  async search(input: StoreSearchInput): Promise<KnowledgeSearchHit[]> {
    return (await this.readChunks())
      .filter((chunk) => matchesMetadataFilters(chunk, input.filters))
      .filter((chunk) => chunk.text.toLowerCase().includes(input.query.toLowerCase()))
      .slice(0, input.topK)
      .map((chunk) => ({
        chunk,
        score: 1,
        citation: citationForChunk(chunk),
      }));
  }

  async stats(): Promise<StoreStats> {
    const chunks = await this.readChunks();
    return {
      chunks: chunks.length,
      sources: countSources(chunks),
      storePath: this.filePath,
      durability: this.durability,
    };
  }

  async listChunks(): Promise<KnowledgeChunk[]> {
    return this.readChunks();
  }

  async listSources(): Promise<string[]> {
    return listSourcePaths(await this.readChunks());
  }

  private async readChunks(): Promise<KnowledgeChunk[]> {
    try {
      return JSON.parse(await fs.readFile(this.filePath, "utf8")) as KnowledgeChunk[];
    } catch (error) {
      if (isMissingFileError(error)) return [];
      throw error;
    }
  }

  private async writeChunks(chunks: KnowledgeChunk[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(chunks, null, 2)}\n`);
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
