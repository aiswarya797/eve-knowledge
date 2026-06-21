import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("production storage docs", () => {
  it("imports runtime helpers as values in the TypeScript recipe", async () => {
    const docs = await fs.readFile("docs/production-storage.md", "utf8");
    const snippet = docs.match(/```ts\n([\s\S]*?)\n```/)?.[1] ?? "";

    expect(snippet).toContain("import {\n  citationForChunk");
    expect(snippet).not.toContain("import type {\n  KnowledgeChunk,\n  KnowledgeSearchHit,\n  KnowledgeStore,\n  StoreSearchInput,\n  StoreStats,\n  citationForChunk");
    expect(snippet).toContain("matchesMetadataFilters(chunk, input.filters)");
  });
});

describe("README docs", () => {
  it("keeps the config example valid JSON", async () => {
    const readme = await fs.readFile("README.md", "utf8");
    const snippet = readme.match(/## Config[\s\S]*?```json\n([\s\S]*?)\n```/)?.[1] ?? "";

    expect(() => JSON.parse(snippet)).not.toThrow();
  });
});
