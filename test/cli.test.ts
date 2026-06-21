import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCli } from "../src/cli.js";
import { parseSearchKnowledgeInput } from "../src/input.js";
import { toModelOutput } from "../src/model-output.js";
import { scaffoldEveKnowledge, scaffoldFiles } from "../src/scaffold.js";
import type { KnowledgeSearchResponse } from "../src/types.js";

let rootDir: string;

beforeEach(async () => {
  rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "eve-knowledge-cli-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(rootDir, { recursive: true, force: true });
});

describe("createCli", () => {
  it("exposes the eve-knowledge command", () => {
    const cli = createCli();

    expect(cli.name()).toBe("eve-knowledge");
  });

  it("runs init, index, and search commands", async () => {
    const previousCwd = process.cwd();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      process.chdir(rootDir);
      await fs.mkdir(path.join(rootDir, "agent"), { recursive: true });
      await fs.writeFile(path.join(rootDir, "agent", "instructions.md"), "You are helpful.");
      await createCli().parseAsync(["node", "eve-knowledge", "init"]);
      await fs.writeFile(
        path.join(rootDir, "agent", "knowledge", "product.md"),
        "# Product\nRefunds are available for 30 days.",
      );
      await createCli().parseAsync(["node", "eve-knowledge", "index"]);
      await createCli().parseAsync(["node", "eve-knowledge", "search", "refunds"]);
    } finally {
      process.chdir(previousCwd);
    }

    const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("agent/tools/search_knowledge.ts");
    expect(output).toContain("filesIndexed");
    expect(output).toContain("agent/knowledge/product.md");
  });

  it("loads eve-knowledge.config.json for CLI index and search", async () => {
    const previousCwd = process.cwd();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      process.chdir(rootDir);
      await fs.mkdir(path.join(rootDir, "kb"), { recursive: true });
      await fs.writeFile(
        path.join(rootDir, "eve-knowledge.config.json"),
        JSON.stringify({ knowledgeDir: "kb", storeDir: ".custom-index" }),
      );
      await fs.writeFile(path.join(rootDir, "kb", "custom.md"), "# Custom\nThe custom config loaded.");

      await createCli().parseAsync(["node", "eve-knowledge", "index"]);
      await createCli().parseAsync(["node", "eve-knowledge", "search", "custom"]);
    } finally {
      process.chdir(previousCwd);
    }

    const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain(".custom-index/index.json");
    expect(output).toContain("kb/custom.md");
  });

  it("refuses executable config unless --trusted-config is provided", async () => {
    const previousCwd = process.cwd();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      process.chdir(rootDir);
      await fs.mkdir(path.join(rootDir, "kb"), { recursive: true });
      await fs.writeFile(
        path.join(rootDir, "eve-knowledge.config.js"),
        `export default { knowledgeDir: "kb", storeDir: ".trusted-index" };\n`,
      );
      await fs.writeFile(path.join(rootDir, "kb", "trusted.md"), "# Trusted\nTrusted config loaded.");

      await expect(createCli().parseAsync(["node", "eve-knowledge", "index"])).rejects.toThrow(
        "Refusing to execute",
      );
      await createCli().parseAsync(["node", "eve-knowledge", "index", "--trusted-config"]);
    } finally {
      process.chdir(previousCwd);
    }

    const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain(".trusted-index/index.json");
  });

  it("fails check when redaction warnings would otherwise pass index", async () => {
    const previousCwd = process.cwd();
    const previousExitCode = process.exitCode;
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      process.exitCode = undefined;
      process.chdir(rootDir);
      await fs.mkdir(path.join(rootDir, "agent", "knowledge"), { recursive: true });
      await fs.writeFile(
        path.join(rootDir, "agent", "knowledge", "leaky.md"),
        "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456",
      );

      await createCli().parseAsync(["node", "eve-knowledge", "check"]);
      expect(process.exitCode).toBe(1);
    } finally {
      process.chdir(previousCwd);
      process.exitCode = previousExitCode;
    }
  });

  it("fails check for stale indexes without mutating them", async () => {
    const previousCwd = process.cwd();
    const previousExitCode = process.exitCode;
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      process.exitCode = undefined;
      process.chdir(rootDir);
      await fs.mkdir(path.join(rootDir, "agent", "knowledge"), { recursive: true });
      await fs.writeFile(path.join(rootDir, "agent", "knowledge", "fresh.md"), "# Fresh\nNew docs.");

      await createCli().parseAsync(["node", "eve-knowledge", "check"]);

      expect(process.exitCode).toBe(1);
      await expect(fs.stat(path.join(rootDir, ".eve-knowledge", "index.json"))).rejects.toThrow();
    } finally {
      process.chdir(previousCwd);
      process.exitCode = previousExitCode;
    }
  });

  it("fails check for deleted indexed files without mutating stale store cleanup", async () => {
    const previousCwd = process.cwd();
    const previousExitCode = process.exitCode;
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      process.exitCode = undefined;
      process.chdir(rootDir);
      await fs.mkdir(path.join(rootDir, "agent", "knowledge"), { recursive: true });
      const stalePath = path.join(rootDir, "agent", "knowledge", "stale.md");
      await fs.writeFile(stalePath, "# Stale\nOld docs.");
      await createCli().parseAsync(["node", "eve-knowledge", "index"]);
      await fs.rm(stalePath);
      await createCli().parseAsync(["node", "eve-knowledge", "check"]);

      expect(process.exitCode).toBe(1);
      const indexJson = await fs.readFile(path.join(rootDir, ".eve-knowledge", "index.json"), "utf8");
      expect(indexJson).toContain("Old docs");
    } finally {
      process.chdir(previousCwd);
      process.exitCode = previousExitCode;
    }
  });

  it("fails check for metadata-only changes without mutating the store", async () => {
    const previousCwd = process.cwd();
    const previousExitCode = process.exitCode;
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      process.exitCode = undefined;
      process.chdir(rootDir);
      await fs.mkdir(path.join(rootDir, "agent", "knowledge"), { recursive: true });
      const docPath = path.join(rootDir, "agent", "knowledge", "policy.md");
      await fs.writeFile(docPath, "---\naudience: support\n---\n# Policy\nShared policy.");
      await createCli().parseAsync(["node", "eve-knowledge", "index"]);
      await fs.writeFile(docPath, "---\naudience: enterprise\n---\n# Policy\nShared policy.");
      await createCli().parseAsync(["node", "eve-knowledge", "check"]);

      expect(process.exitCode).toBe(1);
      const indexJson = await fs.readFile(path.join(rootDir, ".eve-knowledge", "index.json"), "utf8");
      expect(indexJson).toContain('"audience": "support"');
      expect(indexJson).not.toContain('"audience": "enterprise"');
    } finally {
      process.chdir(previousCwd);
      process.exitCode = previousExitCode;
    }
  });

  it("fails production check for the local non-durable store", async () => {
    const previousCwd = process.cwd();
    const previousExitCode = process.exitCode;
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      process.exitCode = undefined;
      process.chdir(rootDir);
      await fs.mkdir(path.join(rootDir, "agent", "knowledge"), { recursive: true });

      await createCli().parseAsync(["node", "eve-knowledge", "check", "--production"]);

      expect(process.exitCode).toBe(1);
    } finally {
      process.chdir(previousCwd);
      process.exitCode = previousExitCode;
    }
  });
});

describe("scaffoldEveKnowledge", () => {
  it("supports dry-run without writing files", async () => {
    const result = await scaffoldEveKnowledge({ cwd: rootDir, dryRun: true, allowNonEve: true });

    expect(result.written).toContain("agent/tools/search_knowledge.ts");
    await expect(fs.stat(path.join(rootDir, "agent", "tools", "search_knowledge.ts"))).rejects.toThrow();
  });

  it("does not overwrite existing files unless forced", async () => {
    const toolPath = path.join(rootDir, "agent", "tools", "search_knowledge.ts");
    await fs.mkdir(path.dirname(toolPath), { recursive: true });
    await fs.writeFile(toolPath, "custom");

    const skipped = await scaffoldEveKnowledge({ cwd: rootDir });
    const preserved = await fs.readFile(toolPath, "utf8");
    const forced = await scaffoldEveKnowledge({ cwd: rootDir, force: true });
    const overwritten = await fs.readFile(toolPath, "utf8");

    expect(skipped.skipped).toContain("agent/tools/search_knowledge.ts");
    expect(preserved).toBe("custom");
    expect(forced.written).toContain("agent/tools/search_knowledge.ts");
    expect(overwritten).toContain('import { defineTool } from "eve/tools";');
    expect(overwritten).toContain("parseSearchKnowledgeInput(input)");
    expect(overwritten).toContain("toModelOutput(output)");
  });

  it("refuses to scaffold when no Eve project is detected unless explicitly allowed", async () => {
    await expect(scaffoldEveKnowledge({ cwd: rootDir })).rejects.toThrow("No Eve project detected");
    await expect(
      scaffoldEveKnowledge({ cwd: rootDir, allowNonEve: true, dryRun: true }),
    ).resolves.toEqual(expect.objectContaining({ written: expect.arrayContaining(["agent/knowledge/README.md"]) }));
  });

  it("does not treat an empty agent directory as enough Eve signal", async () => {
    await fs.mkdir(path.join(rootDir, "agent"), { recursive: true });

    await expect(scaffoldEveKnowledge({ cwd: rootDir })).rejects.toThrow("No Eve project detected");
  });

  it("keeps the example Eve tool identical to the scaffold template", async () => {
    const scaffoldedTool = scaffoldFiles().find((file) => file.path === "agent/tools/search_knowledge.ts");
    const exampleTool = await fs.readFile(
      path.resolve("examples/basic-eve-agent/agent/tools/search_knowledge.ts"),
      "utf8",
    );

    expect(exampleTool).toBe(scaffoldedTool?.content);
  });
});

describe("parseSearchKnowledgeInput", () => {
  it("narrows generated tool input before calling runtime search", () => {
    expect(parseSearchKnowledgeInput({ query: "refunds", topK: 2 })).toEqual({
      query: "refunds",
      topK: 2,
    });
    expect(() => parseSearchKnowledgeInput({ query: "" })).toThrow();
  });
});

describe("toModelOutput", () => {
  it("bounds result text and preserves citations", () => {
    const response: KnowledgeSearchResponse = {
      status: "results",
      query: "refunds",
      results: [
        {
          score: 2,
          chunk: {
            id: "chk_1",
            source: {
              path: "agent/knowledge/product.md",
              format: "markdown",
              contentHash: "abc",
              modifiedTime: "2026-06-21T00:00:00.000Z",
              sizeBytes: 1000,
              metadata: {},
            },
            text: "x".repeat(1_000),
            headingPath: ["Product"],
            ordinal: 0,
            contentHash: "chunk",
            tokenCount: 250,
            charCount: 1_000,
            indexedAt: "2026-06-21T00:00:00.000Z",
          },
          citation: {
            path: "agent/knowledge/product.md",
            heading: "Product",
            chunkId: "chk_1",
            indexedAt: "2026-06-21T00:00:00.000Z",
          },
        },
      ],
    };

    const output = toModelOutput(response);

    expect(output.type).toBe("json");
    expect(JSON.stringify(output.value)).toContain("agent/knowledge/product.md");
    expect(JSON.stringify(output.value)).not.toContain("x".repeat(900));
  });
});
