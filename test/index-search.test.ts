import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { indexKnowledge } from "../src/indexer.js";
import { checkKnowledge } from "../src/check.js";
import { searchKnowledge } from "../src/search.js";
import { createLocalKnowledgeStore } from "../src/store/local.js";
import type {
  KnowledgeChunk,
  KnowledgeSearchHit,
  KnowledgeStore,
  StoreSearchInput,
  StoreStats,
} from "../src/types.js";

let rootDir: string;

beforeEach(async () => {
  rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "eve-knowledge-index-"));
  await fs.mkdir(path.join(rootDir, "agent", "knowledge", "product"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(rootDir, { recursive: true, force: true });
});

describe("indexKnowledge and searchKnowledge", () => {
  it("indexes local knowledge and returns cited lexical search results", async () => {
    await fs.writeFile(
      path.join(rootDir, "agent", "knowledge", "product", "refunds.md"),
      `---
audience: support
---
# Refunds
Refunds are available for 30 days.
`,
    );
    await fs.writeFile(
      path.join(rootDir, "agent", "knowledge", "product", "security.md"),
      `---
audience: enterprise
---
# Security
SOC 2 documents are available under NDA.
`,
    );

    const summary = await indexKnowledge({
      cwd: rootDir,
      now: new Date("2026-06-21T00:00:00.000Z"),
    });

    expect(summary).toMatchObject({
      filesIndexed: 2,
      chunksCreated: 2,
      chunksReused: 0,
      sourcesChanged: 2,
      errors: [],
    });
    expect(summary.store).toMatchObject({ chunks: 2, sources: 2, durability: "local" });

    const response = await searchKnowledge({ query: "refund window", topK: 3 }, { cwd: rootDir });

    expect(response.status).toBe("results");
    if (response.status === "results") {
      expect(response.results[0]?.chunk.text).toContain("30 days");
      expect(response.results[0]?.citation).toMatchObject({
        path: "agent/knowledge/product/refunds.md",
        heading: "Refunds",
      });
    }
  });

  it("supports metadata filters and no-result discipline", async () => {
    await fs.writeFile(
      path.join(rootDir, "agent", "knowledge", "product", "refunds.md"),
      `---
audience: support
tags:
  - billing
  - refunds
---
# Refunds
Refunds are available for 30 days.
`,
    );
    await indexKnowledge({ cwd: rootDir });

    const filtered = await searchKnowledge(
      { query: "refunds", filters: { audience: "enterprise" } },
      { cwd: rootDir },
    );
    const tagMatch = await searchKnowledge(
      { query: "refunds", filters: { tags: "billing" } },
      { cwd: rootDir },
    );
    const tagArrayMatch = await searchKnowledge(
      { query: "refunds", filters: { tags: ["enterprise", "refunds"] } },
      { cwd: rootDir },
    );
    const tagMiss = await searchKnowledge(
      { query: "refunds", filters: { tags: "enterprise" } },
      { cwd: rootDir },
    );
    const missing = await searchKnowledge({ query: "soc compliance" }, { cwd: rootDir });

    expect(filtered).toMatchObject({
      status: "no_results",
      message: expect.stringContaining("Do not fabricate"),
    });
    expect(tagMatch.status).toBe("results");
    expect(tagArrayMatch.status).toBe("results");
    expect(tagMiss.status).toBe("no_results");
    expect(missing).toMatchObject({
      status: "no_results",
      message: expect.stringContaining("Do not fabricate"),
    });
  });

  it("counts reused chunks on unchanged reindex and removes deleted sources", async () => {
    const refundsPath = path.join(rootDir, "agent", "knowledge", "product", "refunds.md");
    const securityPath = path.join(rootDir, "agent", "knowledge", "product", "security.md");
    await fs.writeFile(refundsPath, "# Refunds\nRefunds are available for 30 days.");
    await fs.writeFile(securityPath, "# Security\nSOC 2 documents are available under NDA.");

    await indexKnowledge({ cwd: rootDir, now: new Date("2026-06-21T00:00:00.000Z") });
    const storeAfterFirstRun = createLocalKnowledgeStore({ storeDir: path.join(rootDir, ".eve-knowledge") });
    const firstRunRefundChunk = (await storeAfterFirstRun.listChunks()).find((chunk) =>
      chunk.source.path.endsWith("refunds.md"),
    );
    const second = await indexKnowledge({
      cwd: rootDir,
      now: new Date("2026-06-21T00:00:01.000Z"),
    });
    const storeAfterSecondRun = createLocalKnowledgeStore({ storeDir: path.join(rootDir, ".eve-knowledge") });
    const secondRunRefundChunk = (await storeAfterSecondRun.listChunks()).find((chunk) =>
      chunk.source.path.endsWith("refunds.md"),
    );

    expect(second.chunksCreated).toBe(0);
    expect(second.chunksReused).toBe(2);
    expect(secondRunRefundChunk?.indexedAt).toBe(firstRunRefundChunk?.indexedAt);

    await fs.writeFile(securityPath, "# Security\nUpdated SOC 2 packet is available under NDA.");
    const changed = await indexKnowledge({
      cwd: rootDir,
      now: new Date("2026-06-21T00:00:02.000Z"),
    });
    const storeAfterChangedRun = createLocalKnowledgeStore({ storeDir: path.join(rootDir, ".eve-knowledge") });
    const changedRunRefundChunk = (await storeAfterChangedRun.listChunks()).find((chunk) =>
      chunk.source.path.endsWith("refunds.md"),
    );

    expect(changed.chunksCreated).toBe(1);
    expect(changed.chunksReused).toBe(1);
    expect(changedRunRefundChunk?.indexedAt).toBe(firstRunRefundChunk?.indexedAt);

    await fs.writeFile(
      refundsPath,
      `---
audience: enterprise
---
# Refunds
Refunds are available for 30 days.`,
    );
    const metadataOnly = await indexKnowledge({
      cwd: rootDir,
      now: new Date("2026-06-21T00:00:03.000Z"),
    });
    const storeAfterMetadataRun = createLocalKnowledgeStore({ storeDir: path.join(rootDir, ".eve-knowledge") });
    const metadataRunRefundChunk = (await storeAfterMetadataRun.listChunks()).find((chunk) =>
      chunk.source.path.endsWith("refunds.md"),
    );
    const enterpriseRefunds = await searchKnowledge(
      { query: "refunds", filters: { audience: "enterprise" } },
      { cwd: rootDir },
    );
    const supportRefunds = await searchKnowledge(
      { query: "refunds", filters: { audience: "support" } },
      { cwd: rootDir },
    );

    expect(metadataOnly.chunksCreated).toBe(0);
    expect(metadataOnly.chunksReused).toBe(2);
    expect(metadataRunRefundChunk?.indexedAt).toBe(firstRunRefundChunk?.indexedAt);
    expect(metadataRunRefundChunk?.source.metadata).toEqual({ audience: "enterprise" });
    expect(enterpriseRefunds.status).toBe("results");
    expect(supportRefunds.status).toBe("no_results");

    await fs.writeFile(refundsPath, "# Refunds\n");
    const emptied = await indexKnowledge({
      cwd: rootDir,
      now: new Date("2026-06-21T00:00:04.000Z"),
    });
    const emptiedSearch = await searchKnowledge({ query: "refunds" }, { cwd: rootDir });

    expect(emptied.chunksCreated).toBe(0);
    expect(emptiedSearch.status).toBe("no_results");

    await fs.rm(securityPath);
    const third = await indexKnowledge({
      cwd: rootDir,
      now: new Date("2026-06-21T00:00:05.000Z"),
    });
    const store = createLocalKnowledgeStore({ storeDir: path.join(rootDir, ".eve-knowledge") });

    expect(third.store).toMatchObject({ chunks: 0, sources: 0 });
    await expect(store.listSources()).resolves.toEqual([]);
  });

  it("does not treat mtime-only touches as stale changes", async () => {
    const refundsPath = path.join(rootDir, "agent", "knowledge", "product", "refunds.md");
    await fs.writeFile(refundsPath, "# Refunds\nRefunds are available for 30 days.");
    await indexKnowledge({ cwd: rootDir, now: new Date("2026-06-21T00:00:00.000Z") });
    await fs.utimes(refundsPath, new Date("2026-06-22T00:00:00.000Z"), new Date("2026-06-22T00:00:00.000Z"));

    const summary = await indexKnowledge({
      cwd: rootDir,
      now: new Date("2026-06-22T00:00:00.000Z"),
      dryRun: true,
    });
    const check = await checkKnowledge({ cwd: rootDir });

    expect(summary).toMatchObject({ chunksCreated: 0, chunksReused: 1, sourcesChanged: 0 });
    expect(check.ok).toBe(true);
  });

  it("deletes zero-chunk sources even when a custom store has no listChunks helper", async () => {
    const documentPath = path.join(rootDir, "agent", "knowledge", "product", "refunds.md");
    await fs.writeFile(documentPath, "# Refunds\nRefunds are available for 30 days.");

    const store = new MinimalStore();
    await indexKnowledge({ cwd: rootDir, store });

    expect(store.deletedSources).toEqual([]);
    expect(store.chunks).toHaveLength(1);

    await fs.writeFile(documentPath, "# Refunds\n");
    await indexKnowledge({ cwd: rootDir, store });

    expect(store.deletedSources).toEqual(["agent/knowledge/product/refunds.md"]);
    expect(store.chunks).toHaveLength(0);
  });
});

class MinimalStore implements KnowledgeStore {
  readonly name = "minimal";
  readonly durability = "local";
  readonly deletedSources: string[] = [];
  chunks: KnowledgeChunk[] = [];

  async upsertChunks(chunks: KnowledgeChunk[]): Promise<void> {
    const incomingSources = new Set(chunks.map((chunk) => chunk.source.path));
    this.chunks = [
      ...this.chunks.filter((chunk) => !incomingSources.has(chunk.source.path)),
      ...chunks,
    ];
  }

  async deleteBySource(sourcePath: string): Promise<void> {
    this.deletedSources.push(sourcePath);
    this.chunks = this.chunks.filter((chunk) => chunk.source.path !== sourcePath);
  }

  async search(input: StoreSearchInput): Promise<KnowledgeSearchHit[]> {
    return this.chunks
      .filter((chunk) => chunk.text.toLowerCase().includes(input.query.toLowerCase()))
      .slice(0, input.topK)
      .map((chunk) => ({
        chunk,
        score: 1,
        citation: {
          path: chunk.source.path,
          chunkId: chunk.id,
          indexedAt: chunk.indexedAt,
        },
      }));
  }

  async stats(): Promise<StoreStats> {
    return {
      chunks: this.chunks.length,
      sources: new Set(this.chunks.map((chunk) => chunk.source.path)).size,
      durability: this.durability,
    };
  }
}
