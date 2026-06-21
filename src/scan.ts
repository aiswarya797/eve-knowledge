import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import ignore from "ignore";
import { isMissingFileError, toRepoPath } from "./fs-utils.js";
import type { IndexIssue, ResolvedKnowledgeConfig } from "./types.js";

export interface ScanResult {
  files: string[];
  skipped: IndexIssue[];
  warnings: IndexIssue[];
  errors: IndexIssue[];
}

export async function scanKnowledgeFiles(config: ResolvedKnowledgeConfig): Promise<ScanResult> {
  const builtInIg = ignore().add(config.ignore);
  const userIg = ignore().add(await readEveKnowledgeIgnore(config));
  const rootRealPath = await fs.realpath(config.rootDir);
  const knowledgeRealPath = await fs.realpath(config.knowledgeDir);
  const entries = await fg(config.include, {
    cwd: config.knowledgeDir,
    absolute: true,
    onlyFiles: true,
    dot: true,
    followSymbolicLinks: false,
    unique: true,
  });

  const files: string[] = [];
  const skipped: IndexIssue[] = [];
  const warnings: IndexIssue[] = [];
  const errors: IndexIssue[] = [];

  for (const filePath of entries.sort()) {
    const relativeToRoot = toRepoPath(path.relative(config.rootDir, filePath));
    const relativeToKnowledge = toRepoPath(path.relative(config.knowledgeDir, filePath));

    const lstat = await fs.lstat(filePath);
    if (lstat.isSymbolicLink()) {
      skipped.push(issue("warning", relativeToRoot, "symlink_skipped", "Symlinks are not indexed."));
      continue;
    }

    const realPath = await fs.realpath(filePath);
    if (!isInside(realPath, knowledgeRealPath) || !isInside(realPath, rootRealPath)) {
      skipped.push(issue("warning", relativeToRoot, "path_escape", "File resolves outside the knowledge tree."));
      continue;
    }

    if (
      builtInIg.ignores(relativeToRoot) ||
      builtInIg.ignores(relativeToKnowledge) ||
      userIg.ignores(relativeToRoot) ||
      userIg.ignores(relativeToKnowledge)
    ) {
      skipped.push(issue("info", relativeToRoot, "ignored", "File matched .eveknowledgeignore rules."));
      continue;
    }

    const stat = await fs.stat(filePath);
    if (stat.size > config.maxFileBytes) {
      skipped.push(
        issue(
          "warning",
          relativeToRoot,
          "max_file_size",
          `File is ${stat.size} bytes, above the ${config.maxFileBytes} byte limit.`,
        ),
      );
      continue;
    }

    files.push(filePath);
  }

  return { files, skipped, warnings, errors };
}

async function readEveKnowledgeIgnore(config: ResolvedKnowledgeConfig): Promise<string[]> {
  const candidates = [
    path.join(config.rootDir, ".eveknowledgeignore"),
    path.join(config.knowledgeDir, ".eveknowledgeignore"),
  ];
  const patterns: string[] = [];

  for (const filePath of candidates) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      patterns.push(
        ...content
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.startsWith("#")),
      );
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }
  }

  return patterns;
}

function issue(level: IndexIssue["level"], filePath: string, code: string, message: string): IndexIssue {
  return { level, path: filePath, code, message };
}

function isInside(candidate: string, directory: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
