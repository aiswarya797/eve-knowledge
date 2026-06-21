import path from "node:path";
import type { KnowledgeConfig, ResolvedKnowledgeConfig } from "./types.js";

export const defaultIncludePatterns = ["**/*.{md,mdx,txt,json,yaml,yml}"];

export const defaultIgnorePatterns = [
  ".git/**",
  "node_modules/**",
  "dist/**",
  "build/**",
  ".next/**",
  ".nuxt/**",
  ".output/**",
  ".vercel/**",
  ".turbo/**",
  ".cache/**",
  ".eve-knowledge/**",
  "**/.env",
  "**/.env.*",
  "**/*.pem",
  "**/*.key",
  "**/*secret*",
  "**/*credential*",
];

export const defaultMaxFileBytes = 256 * 1024;

export const defaultChunking = {
  maxCharacters: 1_600,
  overlapCharacters: 160,
};

export function defineKnowledgeConfig(config: KnowledgeConfig): KnowledgeConfig {
  return config;
}

export function resolveKnowledgeConfig(
  config: KnowledgeConfig = {},
  cwd = process.cwd(),
): ResolvedKnowledgeConfig {
  const rootDir = path.resolve(cwd, config.rootDir ?? ".");
  const agentDir = path.resolve(rootDir, config.agentDir ?? "agent");
  const knowledgeDir = path.resolve(rootDir, config.knowledgeDir ?? "agent/knowledge");
  const storeDir = path.resolve(rootDir, config.storeDir ?? ".eve-knowledge");
  const chunking = {
    ...defaultChunking,
    ...config.chunking,
  };

  if (chunking.maxCharacters <= 0) {
    throw new Error("chunking.maxCharacters must be greater than 0");
  }

  if (chunking.overlapCharacters < 0) {
    throw new Error("chunking.overlapCharacters must be zero or greater");
  }

  if (chunking.overlapCharacters >= chunking.maxCharacters) {
    throw new Error("chunking.overlapCharacters must be smaller than chunking.maxCharacters");
  }

  return {
    rootDir,
    agentDir,
    knowledgeDir,
    storeDir,
    include: config.include ?? defaultIncludePatterns,
    ignore: [...defaultIgnorePatterns, ...(config.ignore ?? [])],
    maxFileBytes: config.maxFileBytes ?? defaultMaxFileBytes,
    chunking,
    redaction: {
      mode: config.redaction?.mode ?? "warn",
    },
    memory: config.memory ?? { enabled: false },
  };
}
