import fs from "node:fs/promises";
import path from "node:path";
import { defaultIgnorePatterns } from "./config.js";
import { pathExists } from "./fs-utils.js";
import { detectEveProject } from "./project.js";

export interface ScaffoldOptions {
  cwd: string;
  dryRun?: boolean;
  force?: boolean;
  allowNonEve?: boolean;
}

export interface ScaffoldFile {
  path: string;
  content: string;
}

export interface ScaffoldResult {
  files: ScaffoldFile[];
  written: string[];
  skipped: string[];
}

export async function scaffoldEveKnowledge(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const detection = await detectEveProject(options.cwd);
  if (!detection.isEveProject && !options.allowNonEve) {
    throw new Error(
      "No Eve project detected. Run this inside an Eve app or pass --allow-non-eve to scaffold anyway.",
    );
  }

  const files = scaffoldFiles();
  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const absolutePath = path.join(options.cwd, file.path);
    const exists = await pathExists(absolutePath);

    if (exists && !options.force) {
      skipped.push(file.path);
      continue;
    }

    if (!options.dryRun) {
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, file.content);
    }

    written.push(file.path);
  }

  return { files, written, skipped };
}

export function scaffoldFiles(): ScaffoldFile[] {
  return [
    {
      path: "agent/knowledge/README.md",
      content: knowledgeReadme(),
    },
    {
      path: "agent/knowledge/.eveknowledgeignore",
      content: `${defaultIgnorePatterns.join("\n")}\n`,
    },
    {
      path: "agent/tools/search_knowledge.ts",
      content: searchKnowledgeTool(),
    },
    {
      path: "agent/skills/answer-with-citations.md",
      content: citationSkill(),
    },
    {
      path: "eve-knowledge.config.json",
      content: configFile(),
    },
  ];
}

function knowledgeReadme(): string {
  return `# Agent Knowledge

Place reference docs for this Eve agent here. This folder is indexed by eve-knowledge; Eve core does not currently load agent/knowledge as a native slot.

Recommended folders:

- product/
- runbooks/
- decisions/
- policies/

Do not store credentials, private customer data, or regulated records here unless your team has consent, retention, deletion, and access-control rules in place.
`;
}

function searchKnowledgeTool(): string {
  return `import { defineTool } from "eve/tools";
import { parseSearchKnowledgeInput, searchKnowledge, toModelOutput } from "eve-knowledge";

const inputSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      minLength: 1,
      description: "The natural-language knowledge search query.",
    },
    topK: {
      type: "integer",
      minimum: 1,
      maximum: 10,
      description: "Maximum number of cited chunks to return.",
    },
    filters: {
      type: "object",
      additionalProperties: true,
      description: "Optional metadata filters such as audience, tenant, or product.",
    },
  },
  required: ["query"],
  additionalProperties: false,
} as const;

export default defineTool({
  description: "Search the agent knowledge base and return cited results.",
  inputSchema,
  async execute(input) {
    return searchKnowledge(parseSearchKnowledgeInput(input));
  },
  toModelOutput(output) {
    return toModelOutput(output);
  },
});
`;
}

function citationSkill(): string {
  return `---
description: Answer using retrieved eve-knowledge citations.
---

# Answer With Citations

When answering from knowledge search results:

- Use only the retrieved evidence.
- Cite repo-relative source paths and headings when available.
- If the evidence is missing or weak, say you do not know.
- Do not expose secrets, raw private data, or unrelated chunks.
`;
}

function configFile(): string {
  return `{
  "knowledgeDir": "agent/knowledge",
  "storeDir": ".eve-knowledge",
  "redaction": {
    "mode": "warn"
  }
}
`;
}
