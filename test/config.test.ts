import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultIgnorePatterns,
  defineKnowledgeConfig,
  resolveKnowledgeConfig,
} from "../src/config.js";

describe("resolveKnowledgeConfig", () => {
  it("resolves Eve knowledge defaults relative to the project root", () => {
    const config = resolveKnowledgeConfig({}, "/repo");

    expect(config.rootDir).toBe(path.resolve("/repo"));
    expect(config.agentDir).toBe(path.resolve("/repo/agent"));
    expect(config.knowledgeDir).toBe(path.resolve("/repo/agent/knowledge"));
    expect(config.storeDir).toBe(path.resolve("/repo/.eve-knowledge"));
    expect(config.memory.enabled).toBe(false);
  });

  it("includes safe ignore defaults for generated stores, dependencies, env files, and keys", () => {
    const config = resolveKnowledgeConfig({}, "/repo");

    expect(config.ignore).toEqual(expect.arrayContaining(defaultIgnorePatterns));
    expect(config.ignore).toEqual(
      expect.arrayContaining([".eve-knowledge/**", "**/.env", "**/*.pem", "**/*.key"]),
    );
  });

  it("merges user chunking and ignore overrides", () => {
    const config = resolveKnowledgeConfig(
      defineKnowledgeConfig({
        chunking: { maxCharacters: 800 },
        ignore: ["private/**"],
      }),
      "/repo",
    );

    expect(config.chunking).toEqual({ maxCharacters: 800, overlapCharacters: 160 });
    expect(config.ignore).toContain("private/**");
  });

  it("rejects chunk overlap that would prevent progress", () => {
    expect(() =>
      resolveKnowledgeConfig({
        chunking: { maxCharacters: 100, overlapCharacters: 100 },
      }),
    ).toThrow("chunking.overlapCharacters must be smaller");
  });
});
