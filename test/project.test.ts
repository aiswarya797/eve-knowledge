import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectEveProject } from "../src/project.js";

let rootDir: string;

beforeEach(async () => {
  rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "eve-knowledge-project-"));
});

afterEach(async () => {
  await fs.rm(rootDir, { recursive: true, force: true });
});

describe("detectEveProject", () => {
  it("rejects missing projects and empty agent directories", async () => {
    await expect(detectEveProject(rootDir)).resolves.toMatchObject({ isEveProject: false });
    await fs.mkdir(path.join(rootDir, "agent"));
    await expect(detectEveProject(rootDir)).resolves.toMatchObject({
      isEveProject: false,
      signals: ["agent/"],
    });
  });

  it("accepts instructions, agent file, tools directory, and eve dependencies as signals", async () => {
    await fs.mkdir(path.join(rootDir, "agent"), { recursive: true });
    await fs.writeFile(path.join(rootDir, "agent", "instructions.md"), "Instructions");
    await expect(detectEveProject(rootDir)).resolves.toMatchObject({ isEveProject: true });

    await fs.rm(path.join(rootDir, "agent"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "agent"), { recursive: true });
    await fs.writeFile(path.join(rootDir, "agent", "agent.ts"), "export default {};");
    await expect(detectEveProject(rootDir)).resolves.toMatchObject({ isEveProject: true });

    await fs.rm(path.join(rootDir, "agent"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "agent", "tools"), { recursive: true });
    await expect(detectEveProject(rootDir)).resolves.toMatchObject({ isEveProject: true });

    await fs.rm(path.join(rootDir, "agent"), { recursive: true, force: true });
    await fs.writeFile(path.join(rootDir, "package.json"), JSON.stringify({ dependencies: { eve: "^0.11.10" } }));
    await expect(detectEveProject(rootDir)).resolves.toMatchObject({ isEveProject: true });

    await fs.writeFile(path.join(rootDir, "package.json"), JSON.stringify({ devDependencies: { eve: "^0.11.10" } }));
    await expect(detectEveProject(rootDir)).resolves.toMatchObject({ isEveProject: true });
  });

  it("treats invalid package json as no dependency signal", async () => {
    await fs.writeFile(path.join(rootDir, "package.json"), "{not json");

    await expect(detectEveProject(rootDir)).resolves.toMatchObject({ isEveProject: false });
  });
});

