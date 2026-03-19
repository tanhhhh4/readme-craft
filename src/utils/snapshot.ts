import path from "node:path";
import type { ProjectContext, Snapshot } from "../types/index.js";
import { ensureDir, listFiles, pathExists, readJsonFile, writeText } from "./fs.js";

interface PackageJsonShape {
  name?: string;
  bin?: string | Record<string, string>;
}

const SNAPSHOT_DIR = ".readme-craft";
const SNAPSHOT_FILE = "snapshot.json";

export async function buildSnapshot(context: ProjectContext): Promise<Snapshot> {
  return {
    generatedAt: new Date().toISOString(),
    dependencies: Object.fromEntries(
      [...context.dependencies, ...context.devDependencies]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => [item.name, item.version])
    ),
    srcFiles: await collectSrcFiles(context.rootDir),
    binEntries: await readBinEntries(context.rootDir),
    scripts: { ...context.scripts },
    license: context.license
  };
}

export async function saveSnapshot(targetDir: string, snapshot: Snapshot): Promise<void> {
  const metadataDir = path.join(targetDir, SNAPSHOT_DIR);
  await ensureDir(metadataDir);
  await writeText(path.join(metadataDir, SNAPSHOT_FILE), JSON.stringify(snapshot, null, 2));
}

export async function readSnapshot(targetDir: string): Promise<Snapshot | null> {
  const snapshotPath = path.join(targetDir, SNAPSHOT_DIR, SNAPSHOT_FILE);
  if (!(await pathExists(snapshotPath))) {
    return null;
  }

  return readJsonFile<Snapshot>(snapshotPath);
}

async function collectSrcFiles(rootDir: string): Promise<string[]> {
  const files = await listFiles(rootDir, (filePath) => path.relative(rootDir, filePath).startsWith("src/"));
  return files.map((filePath) => path.relative(rootDir, filePath)).sort();
}

async function readBinEntries(rootDir: string): Promise<Record<string, string>> {
  const packageJson = await readJsonFile<PackageJsonShape>(path.join(rootDir, "package.json"));
  if (typeof packageJson.bin === "string") {
    const packageName = packageJson.name ?? path.basename(rootDir);
    return { [packageName]: packageJson.bin };
  }

  return Object.fromEntries(
    Object.entries(packageJson.bin ?? {}).sort(([left], [right]) => left.localeCompare(right))
  );
}
