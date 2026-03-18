import path from "node:path";
import { scanNodeProject } from "./node.js";
import type { ProjectContext } from "../types/index.js";
import { pathExists } from "../utils/fs.js";

export async function scanProject(targetDir: string): Promise<ProjectContext> {
  const rootDir = path.resolve(targetDir);
  if (await pathExists(path.join(rootDir, "package.json"))) {
    return scanNodeProject(rootDir);
  }

  throw new Error(`Unsupported project type in ${rootDir}. MVP currently supports Node.js projects.`);
}
