import { promises as fs } from "node:fs";
import path from "node:path";
import type { TreeNode } from "../types/index.js";

const DEFAULT_IGNORE = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".idea"
]);

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

export async function buildDirectoryTree(
  rootDir: string,
  currentDir = rootDir,
  depth = 0,
  maxDepth = 4
): Promise<TreeNode> {
  const relativePath = path.relative(rootDir, currentDir) || ".";
  const node: TreeNode = {
    name: path.basename(currentDir),
    path: relativePath,
    type: "directory",
    children: []
  };

  if (depth >= maxDepth) {
    return node;
  }

  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (DEFAULT_IGNORE.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(currentDir, entry.name);
    const entryRelative = path.relative(rootDir, entryPath);
    if (entry.isDirectory()) {
      node.children?.push(await buildDirectoryTree(rootDir, entryPath, depth + 1, maxDepth));
    } else {
      node.children?.push({
        name: entry.name,
        path: entryRelative,
        type: "file"
      });
    }
  }

  return node;
}

export async function listFiles(
  rootDir: string,
  predicate: (filePath: string) => boolean
): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (DEFAULT_IGNORE.has(entry.name)) {
        continue;
      }

      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (predicate(entryPath)) {
        results.push(entryPath);
      }
    }
  }

  await walk(rootDir);
  return results.sort();
}
