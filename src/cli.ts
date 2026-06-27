import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { checkKnowledge } from "./check.js";
import { loadKnowledgeConfig } from "./config-loader.js";
import { indexKnowledge } from "./indexer.js";
import { version } from "./index.js";
import { searchKnowledge } from "./search.js";
import { scaffoldEveKnowledge } from "./scaffold.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("eve-knowledge")
    .description("Add a cited agent/knowledge folder to Eve agents.")
    .version(version);

  program
    .command("init")
    .description("Create the agent/knowledge convention, Eve tool, citation skill, and config.")
    .option("--dry-run", "Print planned files without writing them.")
    .option("--force", "Overwrite existing generated files.")
    .option("--allow-non-eve", "Scaffold even if no Eve project is detected.")
    .action(async (options: { dryRun?: boolean; force?: boolean; allowNonEve?: boolean }) => {
      const result = await scaffoldEveKnowledge({
        cwd: process.cwd(),
        ...(options.dryRun ? { dryRun: true } : {}),
        ...(options.force ? { force: true } : {}),
        ...(options.allowNonEve ? { allowNonEve: true } : {}),
      });

      printList(options.dryRun ? "Would write" : "Written", result.written);
      printList("Skipped existing files", result.skipped);

      if (result.skipped.length > 0 && !options.force) {
        console.log("Use --force to overwrite skipped files.");
      }
    });

  program
    .command("index")
    .description("Index files from agent/knowledge into the configured local store.")
    .option("--trusted-config", "Allow executable eve-knowledge.config.ts/js/mjs. Use only with trusted code.")
    .action(async (options: { trustedConfig?: boolean }) => {
      const config = await loadKnowledgeConfig({ trustedConfig: Boolean(options.trustedConfig) });
      const summary = await indexKnowledge({ config });
      console.log(JSON.stringify(summary, null, 2));
      if (summary.errors.length > 0) {
        process.exitCode = 1;
      }
    });

  program
    .command("search")
    .description("Search the local knowledge store.")
    .argument("<query>", "Knowledge search query.")
    .option("--top-k <number>", "Maximum number of results.", parseInteger)
    .option("--trusted-config", "Allow executable eve-knowledge.config.ts/js/mjs. Use only with trusted code.")
    .action(async (query: string, options: { topK?: number; trustedConfig?: boolean }) => {
      const config = await loadKnowledgeConfig({ trustedConfig: Boolean(options.trustedConfig) });
      const response = await searchKnowledge(
        {
          query,
          ...(options.topK !== undefined ? { topK: options.topK } : {}),
        },
        { config },
      );
      console.log(JSON.stringify(response, null, 2));
    });

  program
    .command("check")
    .description("Validate that knowledge can be indexed safely for CI.")
    .option("--production", "Fail if the configured store is not durable.")
    .option("--trusted-config", "Allow executable eve-knowledge.config.ts/js/mjs. Use only with trusted code.")
    .action(async (options: { production?: boolean; trustedConfig?: boolean }) => {
      const loadedConfig = await loadKnowledgeConfig({ trustedConfig: Boolean(options.trustedConfig) });
      const result = await checkKnowledge({
        config: {
          ...loadedConfig,
        },
        ...(options.production ? { production: true } : {}),
      });
      console.log(JSON.stringify(result, null, 2));

      if (!result.ok) {
        process.exitCode = 1;
      }
    });

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  await createCli().parseAsync(argv);
}

export function isCliEntryPoint(metaUrl: string, argvPath = process.argv[1]): boolean {
  if (!argvPath) return false;

  const modulePath = fileURLToPath(metaUrl);

  try {
    return fs.realpathSync.native(modulePath) === fs.realpathSync.native(argvPath);
  } catch {
    return path.resolve(modulePath) === path.resolve(argvPath);
  }
}

if (isCliEntryPoint(import.meta.url)) {
  await runCli();
}

function printList(label: string, values: string[]): void {
  if (values.length === 0) return;

  console.log(`${label}:`);
  for (const value of values) {
    console.log(`  - ${value}`);
  }
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Expected an integer, received ${value}`);
  }

  return parsed;
}
