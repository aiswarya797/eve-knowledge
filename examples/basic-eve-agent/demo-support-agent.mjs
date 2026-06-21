#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { indexKnowledge, searchKnowledge } from "../../dist/index.js";

const cwd = path.dirname(fileURLToPath(import.meta.url));
const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "eve-knowledge-demo-"));
const config = {
  rootDir: cwd,
  knowledgeDir: "agent/knowledge",
  storeDir,
};

try {
  await indexKnowledge({ cwd, config });

  const refundHit = await firstHit("refund policy");
  const securityHit = await firstHit("SOC 2 security documents");

  console.log("$ node examples/basic-eve-agent/demo-support-agent.mjs");
  console.log("");
  console.log("User: Can we refund a customer, and where do we find SOC 2 docs?");
  console.log("");
  console.log('Tool: search_knowledge({ query: "refund policy", topK: 1 })');
  console.log(`  -> ${snippet(refundHit.chunk.text)} [${citation(refundHit)}]`);
  console.log('Tool: search_knowledge({ query: "SOC 2 security documents", topK: 1 })');
  console.log(`  -> ${snippet(securityHit.chunk.text)} [${citation(securityHit)}]`);
  console.log("");
  console.log("Assistant:");
  console.log(
    "Yes. Refunds are available for 30 days after purchase. SOC 2 reports are available to enterprise customers under NDA through the security review queue.",
  );
  console.log("");
  console.log("Citations:");
  console.log(`- ${citation(refundHit)}`);
  console.log(`- ${citation(securityHit)}`);
} finally {
  await fs.rm(storeDir, { recursive: true, force: true });
}

async function firstHit(query) {
  const response = await searchKnowledge({ query, topK: 1 }, { cwd, config });
  if (response.status === "no_results") {
    throw new Error(`Expected a result for ${query}`);
  }

  const hit = response.results[0];
  if (!hit) {
    throw new Error(`Expected a top result for ${query}`);
  }

  return hit;
}

function citation(hit) {
  const heading = hit.citation.heading ? `#${hit.citation.heading}` : "";
  return `${hit.citation.path}${heading}`;
}

function snippet(text) {
  return text.length > 96 ? `${text.slice(0, 93).trimEnd()}...` : text;
}
