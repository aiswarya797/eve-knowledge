# Production Storage

`eve-knowledge` ships with a local JSON store for development. It is intentionally simple and excellent for local Eve apps, tests, and demos.

Do not rely on local filesystem durability for serverless production deployments unless your runtime provides persistent writable storage. In many Vercel-style serverless deployments, local writes are ephemeral.

## Recommended Production Shape

Use the core `KnowledgeStore` interface to connect a durable store:

```ts
import {
  citationForChunk,
  countSources,
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

export class DurableJsonRecipeStore implements KnowledgeStore {
  readonly name = "durable-json-recipe";
  readonly durability = "durable";

  constructor(private readonly bucket: DurableObjectLike) {}

  async upsertChunks(chunks: KnowledgeChunk[]): Promise<void> {
    await this.writeChunks(replaceChunksBySource(await this.readChunks(), chunks));
  }

  async deleteBySource(sourcePath: string): Promise<void> {
    await this.writeChunks(removeChunksBySource(await this.readChunks(), sourcePath));
  }

  async search(input: StoreSearchInput): Promise<KnowledgeSearchHit[]> {
    // Replace with database/vector search in real production. Keep output bounded and cited.
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
      durability: "durable",
    };
  }

  private async readChunks(): Promise<KnowledgeChunk[]> {
    return (await this.bucket.get("eve-knowledge:index")) ?? [];
  }

  private async writeChunks(chunks: KnowledgeChunk[]): Promise<void> {
    await this.bucket.put("eve-knowledge:index", chunks);
  }
}

interface DurableObjectLike {
  get(key: string): Promise<KnowledgeChunk[] | undefined>;
  put(key: string, value: KnowledgeChunk[]): Promise<void>;
}
```

Minimum adapter behavior:

- `upsertChunks(chunks)` replaces all chunks for incoming source paths.
- `deleteBySource(sourcePath)` removes all chunks for a removed or empty source.
- `search({ query, topK, filters })` returns bounded cited hits.
- `stats()` reports chunk count, source count, and `durability: "durable"`.
- `listChunks()` and `listSources()` are strongly recommended so `eve-knowledge check` can detect deleted files and metadata-only changes without mutating production state.

For CI, run:

```bash
npx eve-knowledge check
```

`check` treats redaction findings as failures so unsafe docs do not silently ship.
