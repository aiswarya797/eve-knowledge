import fs from "node:fs/promises";
import path from "node:path";

export function toRepoPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
