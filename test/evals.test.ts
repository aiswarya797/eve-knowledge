import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runKnowledgeEvals } from "../src/evals.js";
import { checkKnowledge } from "../src/check.js";
import { indexKnowledge } from "../src/indexer.js";
import { searchKnowledge } from "../src/search.js";

let rootDir: string;

beforeEach(async () => {
  rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "eve-knowledge-evals-"));
  await fs.mkdir(path.join(rootDir, "agent", "knowledge", "product"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(rootDir, { recursive: true, force: true });
});

describe("runKnowledgeEvals", () => {
  it("checks cited answerable, no-answer, and metadata-filtered cases", async () => {
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

    const results = await runKnowledgeEvals({
      cwd: rootDir,
      cases: [
        {
          name: "refund citation",
          query: "refund window",
          expectPath: "agent/knowledge/product/refunds.md",
        },
        {
          name: "no answer",
          query: "HIPAA attestation",
          expectNoResults: true,
        },
        {
          name: "filtered enterprise security",
          query: "security documents",
          filters: { audience: "enterprise" },
          expectPath: "agent/knowledge/product/security.md",
        },
      ],
    });

    expect(results).toEqual([
      expect.objectContaining({ name: "refund citation", passed: true }),
      expect.objectContaining({ name: "no answer", passed: true }),
      expect.objectContaining({ name: "filtered enterprise security", passed: true }),
    ]);
  });

  it("does not expose ignored secret-looking files through eval-indexed search", async () => {
    await fs.writeFile(path.join(rootDir, "agent", "knowledge", ".eveknowledgeignore"), "private/**\n");
    await fs.mkdir(path.join(rootDir, "agent", "knowledge", "private"), { recursive: true });
    await fs.writeFile(
      path.join(rootDir, "agent", "knowledge", "private", "token.md"),
      "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456",
    );
    await fs.writeFile(
      path.join(rootDir, "agent", "knowledge", "product", "safe.md"),
      "# Safe\nPublic docs only.",
    );

    await runKnowledgeEvals({
      cwd: rootDir,
      cases: [{ name: "safe", query: "public docs", expectPath: "agent/knowledge/product/safe.md" }],
    });

    await expect(searchKnowledge({ query: "OPENAI_API_KEY" }, { cwd: rootDir })).resolves.toMatchObject({
      status: "no_results",
    });
  });

  it("covers repeated headings, deleted files, stale indexes, and long docs", async () => {
    const repeatedPath = path.join(rootDir, "agent", "knowledge", "product", "repeated.md");
    const deletedPath = path.join(rootDir, "agent", "knowledge", "product", "deleted.md");
    const longPath = path.join(rootDir, "agent", "knowledge", "product", "long.md");
    await fs.writeFile(
      repeatedPath,
      `# Policy
Alpha policy applies to trials.

# Policy
Beta policy applies to enterprise renewals.
`,
    );
    await fs.writeFile(deletedPath, "# Deprecated\nThis should disappear.");
    await fs.writeFile(longPath, `# Long\n${"long context ".repeat(300)}final warranty clause.`);

    let results = await runKnowledgeEvals({
      cwd: rootDir,
      config: { chunking: { maxCharacters: 240, overlapCharacters: 40 } },
      cases: [
        {
          name: "repeated heading beta",
          query: "enterprise renewals beta",
          expectPath: "agent/knowledge/product/repeated.md",
        },
        {
          name: "long doc final clause",
          query: "final warranty clause",
          expectPath: "agent/knowledge/product/long.md",
        },
      ],
    });

    expect(results.every((result) => result.passed)).toBe(true);

    await fs.rm(deletedPath);
    await indexKnowledge({ cwd: rootDir });
    results = await runKnowledgeEvals({
      cwd: rootDir,
      cases: [
        {
          name: "deleted file no answer",
          query: "deprecated disappear",
          expectNoResults: true,
        },
      ],
    });

    expect(results[0]?.passed).toBe(true);

    await fs.writeFile(
      path.join(rootDir, "agent", "knowledge", "product", "stale.md"),
      "# Stale\nThis new file has not been indexed yet.",
    );
    const stale = await checkKnowledge({ cwd: rootDir });

    expect(stale.ok).toBe(false);
    expect(stale.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "stale_index" })]));
  });
});
