import fs from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./fs-utils.js";

export interface EveProjectDetection {
  isEveProject: boolean;
  signals: string[];
}

export async function detectEveProject(cwd: string): Promise<EveProjectDetection> {
  const signals: string[] = [];
  const agentDir = path.join(cwd, "agent");

  if (await pathExists(agentDir)) {
    signals.push("agent/");
  }

  for (const filePath of ["agent/agent.ts", "agent/instructions.md", "agent/tools"]) {
    if (await pathExists(path.join(cwd, filePath))) {
      signals.push(filePath);
    }
  }

  if (await packageHasEveDependency(path.join(cwd, "package.json"))) {
    signals.push("package.json:eve");
  }

  return {
    isEveProject: signals.some((signal) => signal !== "agent/"),
    signals,
  };
}

async function packageHasEveDependency(filePath: string): Promise<boolean> {
  try {
    const pkg = JSON.parse(await fs.readFile(filePath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(pkg.dependencies?.eve ?? pkg.devDependencies?.eve);
  } catch {
    return false;
  }
}
