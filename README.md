# eve-knowledge

[![npm version](https://img.shields.io/npm/v/eve-knowledge.svg)](https://www.npmjs.com/package/eve-knowledge)
[![CI](https://github.com/aiswarya797/eve-knowledge/actions/workflows/ci.yml/badge.svg)](https://github.com/aiswarya797/eve-knowledge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Add a cited `agent/knowledge/` folder to Eve agents.

`agent/knowledge/` is an `eve-knowledge` convention, not a native Eve slot. The package indexes those files explicitly and exposes them through a generated `search_knowledge` Eve tool.

## Quickstart

Requires Node.js 24 or newer, matching Eve's current runtime requirement.

```bash
npm install eve-knowledge
npx eve-knowledge init
npx eve-knowledge index
npx eve-knowledge search "refund policy"
```

`init` creates:

```txt
agent/
  knowledge/
    README.md
    .eveknowledgeignore
  tools/
    search_knowledge.ts
  skills/
    answer-with-citations.md
eve-knowledge.config.json
```

## Mental Model

- `instructions.md` tells the agent how to behave.
- `tools/` exposes typed runtime actions.
- `skills/` are load-on-demand procedures and playbooks.
- `connections/` connect external MCP or OpenAPI services.
- `agent/knowledge/` is reference material indexed by `eve-knowledge`.

## When To Use What

| Need | Use | Why |
| --- | --- | --- |
| Permanent behavior and personality | `agent/instructions.md` | Always-on guidance for the agent. |
| A typed runtime action | `agent/tools/` | Tools execute code and can access runtime services. |
| A procedure the model should load on demand | `agent/skills/` | Skills are playbooks, not document stores. |
| External SaaS/API/MCP capabilities | `agent/connections/` | Connections hide credentials and expose remote tools. |
| Product docs, runbooks, policies, decisions | `agent/knowledge/` with `eve-knowledge` | Reference material should be searched and cited, not stuffed into prompts. |
| Runtime-learned user facts | Future memory layer | Mutable memory needs approval, retention, delete, export, and audit rules. |

## File Conventions

Supported files:

- Markdown
- MDX
- Plain text
- JSON
- YAML

Markdown frontmatter becomes metadata. Headings become citation context. `.eveknowledgeignore` adds project-specific ignore rules on top of safe defaults for env files, keys, build output, dependencies, and the local `.eve-knowledge/` store.

## Config

```json
{
  "knowledgeDir": "agent/knowledge",
  "storeDir": ".eve-knowledge",
  "redaction": {
    "mode": "warn"
  }
}
```

`index` warns on likely secrets by default. `check` runs with fail-fast redaction semantics for CI.

Executable `eve-knowledge.config.ts/js/mjs` files are trusted-code only and require `--trusted-config`. CI should use `eve-knowledge.config.json`.

## Embeddings

The MVP uses lexical search so development, tests, and evals work without an embedding provider. The public contracts include `EmbeddingProvider` and `KnowledgeStore` so production adapters can add vector search without changing the generated Eve tool.

If you add embeddings, keep provider configuration explicit. Do not silently send private docs to a third-party embedding provider.

## CLI

```bash
npx eve-knowledge init --dry-run
npx eve-knowledge init --force
npx eve-knowledge index
npx eve-knowledge check
npx eve-knowledge search "SOC 2"
```

`init` detects Eve projects through `agent/instructions.md`, `agent/agent.ts`, `agent/tools/`, or an `eve` dependency. Use `--allow-non-eve` only for tests, templates, or unusual project layouts.

## Evals

```ts
import { runKnowledgeEvals } from "eve-knowledge";

const results = await runKnowledgeEvals({
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
  ],
});
```

## Memory Versus Knowledge

Reference knowledge is committed source material. Mutable memory is learned at runtime. `eve-knowledge` keeps memory disabled by default and does not silently persist user facts.

Future memory support must include provenance, approval, delete, forget, export, retention, and redaction hooks before it becomes a default feature.

## Common Examples

Support runbook:

```txt
agent/knowledge/runbooks/refunds.md
agent/knowledge/runbooks/escalations.md
```

Repo decisions:

```txt
agent/knowledge/decisions/0001-use-postgres.md
agent/knowledge/decisions/0002-agent-memory-policy.md
```

Product docs:

```txt
agent/knowledge/product/pricing.md
agent/knowledge/product/security.md
```

Personal memory:

Keep mutable personal memory out of reference docs until you have explicit approval, retention, delete, export, and audit rules. Use committed reference docs for stable facts and policies.

## Storage

The built-in local JSON store is for development and tests. For production, use a durable adapter that implements the exported `KnowledgeStore` contract. See [docs/production-storage.md](docs/production-storage.md).

## Native Eve Knowledge Slot

If Eve later ships a native `agent/knowledge/` slot, this package should become the migration bridge:

1. Keep the same folder convention.
2. Reuse existing chunk metadata and citations where possible.
3. Replace the generated `search_knowledge` tool with Eve's native capability.
4. Keep `eve-knowledge check` as a CI/eval layer if it remains useful.

Until that exists, `agent/knowledge/` is only an `eve-knowledge` convention.

## Privacy

Do not index private customer data, personal data, credentials, or regulated records unless you have consent, retention rules, deletion procedures, and an appropriate production store. The default scanner ignores common secret files and warns on secret-looking content, but those checks are guardrails, not a substitute for data governance.

## Troubleshooting

- No Eve project detected: add `agent/instructions.md`, `agent/agent.ts`, `agent/tools/`, or an `eve` dependency.
- Search returns no results: run `npx eve-knowledge index` and check `.eve-knowledge/index.json`.
- CI fails on redaction: remove the unsafe file, add a safe ignore rule, or move sensitive data to a governed system.
- Production warning: do not use local filesystem storage for durable serverless workloads.
