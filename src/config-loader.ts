import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { KnowledgeConfig } from "./types.js";

const safeConfigFileNames = ["eve-knowledge.config.json"];
const trustedConfigFileNames = ["eve-knowledge.config.ts", "eve-knowledge.config.mjs", "eve-knowledge.config.js"];

export interface LoadKnowledgeConfigOptions {
  cwd?: string;
  trustedConfig?: boolean;
}

export async function loadKnowledgeConfig(options: LoadKnowledgeConfigOptions = {}): Promise<KnowledgeConfig> {
  const cwd = options.cwd ?? process.cwd();
  const safeConfigPath = await findConfigPath(cwd, safeConfigFileNames);
  if (safeConfigPath) {
    return JSON.parse(await fs.readFile(safeConfigPath, "utf8")) as KnowledgeConfig;
  }

  const configPath = await findConfigPath(cwd, trustedConfigFileNames);
  if (!configPath) return {};
  if (!options.trustedConfig) {
    throw new Error(
      `Refusing to execute ${path.basename(configPath)}. Use --trusted-config for trusted local config, or use eve-knowledge.config.json for CI.`,
    );
  }

  const loaded = (await import(pathToFileURL(configPath).href)) as {
    default?: KnowledgeConfig;
  };

  return loaded.default ?? {};
}

async function findConfigPath(cwd: string, fileNames: string[]): Promise<string | undefined> {
  for (const fileName of fileNames) {
    const filePath = path.join(cwd, fileName);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // Try the next supported config filename.
    }
  }

  return undefined;
}
