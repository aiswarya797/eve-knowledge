import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chunkDocument } from "../src/chunk.js";
import { resolveKnowledgeConfig } from "../src/config.js";
import { indexKnowledge } from "../src/indexer.js";
import { loadKnowledgeDocument } from "../src/loader.js";
import { detectSecrets } from "../src/redaction.js";
import { scanKnowledgeFiles } from "../src/scan.js";
import { searchKnowledge } from "../src/search.js";

let rootDir: string;

beforeEach(async () => {
  rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "eve-knowledge-"));
  await fs.mkdir(path.join(rootDir, "agent", "knowledge", "product"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(rootDir, { recursive: true, force: true });
});

describe("loadKnowledgeDocument", () => {
  it("loads markdown frontmatter and preserves heading paths", async () => {
    const filePath = path.join(rootDir, "agent", "knowledge", "product", "refunds.md");
    await fs.writeFile(
      filePath,
      `---
audience: support
tags:
  - billing
---
# Refunds
Refunds are available for 30 days.

## Edge Cases
Enterprise contracts require finance review.
`,
    );

    const config = resolveKnowledgeConfig({}, rootDir);
    const document = await loadKnowledgeDocument(filePath, config);

    expect(document?.source).toMatchObject({
      path: "agent/knowledge/product/refunds.md",
      format: "markdown",
      metadata: { audience: "support", tags: ["billing"] },
    });
    expect(document?.sections).toEqual([
      {
        text: "Refunds are available for 30 days.",
        headingPath: ["Refunds"],
        ordinal: 0,
      },
      {
        text: "Enterprise contracts require finance review.",
        headingPath: ["Refunds", "Edge Cases"],
        ordinal: 1,
      },
    ]);
  });

  it("loads yaml and json files into normalized text sections", async () => {
    const yamlPath = path.join(rootDir, "agent", "knowledge", "product", "policy.yaml");
    const jsonPath = path.join(rootDir, "agent", "knowledge", "product", "limits.json");
    await fs.writeFile(yamlPath, "owner: ops\npublished: true\n");
    await fs.writeFile(jsonPath, JSON.stringify({ tier: "pro", limit: 100 }));

    const config = resolveKnowledgeConfig({}, rootDir);
    const yamlDocument = await loadKnowledgeDocument(yamlPath, config);
    const jsonDocument = await loadKnowledgeDocument(jsonPath, config);

    expect(yamlDocument?.source.metadata).toEqual({ owner: "ops", published: true });
    expect(yamlDocument?.sections[0]?.text).toContain('"owner": "ops"');
    expect(jsonDocument?.source.metadata).toEqual({ tier: "pro", limit: 100 });
    expect(jsonDocument?.sections[0]?.text).toContain('"limit": 100');
  });

  it("indexes and searches mdx and plain text files", async () => {
    const mdxPath = path.join(rootDir, "agent", "knowledge", "product", "component.mdx");
    const txtPath = path.join(rootDir, "agent", "knowledge", "product", "plain.txt");
    await fs.writeFile(
      mdxPath,
      `---
audience: docs
---
# Component
MDX component knowledge includes setup guidance.
`,
    );
    await fs.writeFile(txtPath, "Plain text knowledge includes support escalation guidance.");

    await indexKnowledge({ cwd: rootDir });
    const mdxResult = await searchKnowledge({ query: "component setup" }, { cwd: rootDir });
    const txtResult = await searchKnowledge({ query: "support escalation" }, { cwd: rootDir });

    expect(mdxResult.status).toBe("results");
    expect(txtResult.status).toBe("results");
    if (mdxResult.status === "results") {
      expect(mdxResult.results[0]?.citation.path).toBe("agent/knowledge/product/component.mdx");
    }
    if (txtResult.status === "results") {
      expect(txtResult.results[0]?.citation.path).toBe("agent/knowledge/product/plain.txt");
    }
  });

  it("does not index empty yaml as searchable null text", async () => {
    await fs.writeFile(path.join(rootDir, "agent", "knowledge", "product", "empty.yaml"), "# comment only\n");

    const summary = await indexKnowledge({ cwd: rootDir });
    const result = await searchKnowledge({ query: "null" }, { cwd: rootDir });

    expect(summary.store).toMatchObject({ chunks: 0, sources: 0 });
    expect(result.status).toBe("no_results");
  });
});

describe("chunkDocument", () => {
  it("creates deterministic bounded chunks with stable citation metadata", async () => {
    const filePath = path.join(rootDir, "agent", "knowledge", "product", "repeated.md");
    await fs.writeFile(
      filePath,
      `# Policy
${"Alpha ".repeat(40)}

# Policy
${"Beta ".repeat(40)}
`,
    );

    const config = resolveKnowledgeConfig(
      { chunking: { maxCharacters: 80, overlapCharacters: 10 } },
      rootDir,
    );
    const document = await loadKnowledgeDocument(filePath, config);
    const firstRun = chunkDocument(document!, config, "2026-06-21T00:00:00.000Z");
    const secondRun = chunkDocument(document!, config, "2026-06-21T00:00:00.000Z");

    expect(firstRun.length).toBeGreaterThan(2);
    expect(firstRun.map((chunk) => chunk.id)).toEqual(secondRun.map((chunk) => chunk.id));
    expect(firstRun.every((chunk) => chunk.charCount <= 80)).toBe(true);
    expect(firstRun[0]?.headingPath).toEqual(["Policy"]);
    expect(new Set(firstRun.map((chunk) => chunk.id)).size).toBe(firstRun.length);
  });
});

describe("scanKnowledgeFiles", () => {
  it("loads .eveknowledgeignore rules from the knowledge folder", async () => {
    await fs.mkdir(path.join(rootDir, "agent", "knowledge", "private"), { recursive: true });
    await fs.writeFile(path.join(rootDir, "agent", "knowledge", ".eveknowledgeignore"), "private/**\n");
    await fs.writeFile(
      path.join(rootDir, "agent", "knowledge", "product", "safe.md"),
      "# Safe\nThis document is fine.",
    );
    await fs.writeFile(
      path.join(rootDir, "agent", "knowledge", "private", "skip.md"),
      "# Private\nDo not index.",
    );

    const result = await scanKnowledgeFiles(resolveKnowledgeConfig({}, rootDir));

    expect(result.files.map((filePath) => path.basename(filePath))).toEqual(["safe.md"]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ignored", path: "agent/knowledge/private/skip.md" }),
      ]),
    );
  });

  it("does not allow .eveknowledgeignore negation to unignore protected defaults", async () => {
    await fs.writeFile(path.join(rootDir, "agent", "knowledge", ".eveknowledgeignore"), "!**/*secret*\n!**/.env.*\n");
    await fs.writeFile(
      path.join(rootDir, "agent", "knowledge", "product", "secret-policy.md"),
      "# Secret\nShould stay ignored by protected defaults.",
    );
    await fs.writeFile(
      path.join(rootDir, "agent", "knowledge", ".env.local"),
      "TOKEN=should-not-index",
    );
    await fs.writeFile(
      path.join(rootDir, "agent", "knowledge", "product", "safe.md"),
      "# Safe\nStill index safe docs.",
    );

    const result = await scanKnowledgeFiles(resolveKnowledgeConfig({}, rootDir));

    expect(result.files.map((filePath) => path.basename(filePath))).toEqual(["safe.md"]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ignored", path: "agent/knowledge/product/secret-policy.md" }),
      ]),
    );
  });

  it("skips symlinks so knowledge cannot escape the configured tree", async () => {
    const outsidePath = path.join(rootDir, "outside.md");
    const linkPath = path.join(rootDir, "agent", "knowledge", "product", "linked.md");
    await fs.writeFile(outsidePath, "# Outside\nPrivate data.");
    await fs.symlink(outsidePath, linkPath);

    const result = await scanKnowledgeFiles(resolveKnowledgeConfig({}, rootDir));

    expect(result.files).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("skips oversized files during scan", async () => {
    await fs.writeFile(
      path.join(rootDir, "agent", "knowledge", "product", "safe.md"),
      "# Safe\nThis document is fine.",
    );
    await fs.writeFile(
      path.join(rootDir, "agent", "knowledge", "product", "large.txt"),
      "x".repeat(80),
    );

    const config = resolveKnowledgeConfig({ maxFileBytes: 60 }, rootDir);
    const result = await scanKnowledgeFiles(config);

    expect(result.files.map((filePath) => path.basename(filePath))).toEqual(["safe.md"]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "max_file_size", path: "agent/knowledge/product/large.txt" }),
      ]),
    );
    expect(result.warnings).toEqual([]);
  });

  it("reports likely secrets during indexing without storing them", async () => {
    await fs.writeFile(
      path.join(rootDir, "agent", "knowledge", "product", "safe.md"),
      "# Safe\nThis document is fine.",
    );
    await fs.writeFile(
      path.join(rootDir, "agent", "knowledge", "product", "leaky.md"),
      "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456",
    );

    const summary = await indexKnowledge({ cwd: rootDir });

    expect(summary.filesIndexed).toBe(1);
    expect(summary.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "possible_secret", path: "agent/knowledge/product/leaky.md" }),
      ]),
    );
    expect(summary.store).toMatchObject({ chunks: 1, sources: 1 });
  });

  it("can detect common secret-looking values directly", () => {
    expect(detectSecrets("GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234")).toEqual([
      expect.objectContaining({ label: "github_token" }),
      expect.objectContaining({ label: "env_secret_assignment" }),
    ]);
  });
});
