import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { ProjectContext } from "../types/index.js";
import { pathExists, readJsonFile } from "../utils/fs.js";

const execFileAsync = promisify(execFile);
const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

interface PackageJsonShape {
  bin?: string | Record<string, string>;
}

export async function captureCliHelp(context: ProjectContext): Promise<string | null> {
  const packageJsonPath = path.join(context.rootDir, "package.json");
  const packageJson = await readJsonFile<PackageJsonShape>(packageJsonPath);
  const distEntry = resolveBinEntry(packageJson.bin);
  if (!distEntry) {
    return null;
  }

  const devEntry = await resolveDevEntry(context.rootDir, distEntry);
  const attempts: Array<{ command: string; args: string[] }> = [
    {
      command: "npx",
      args: ["tsx", devEntry, "--help"]
    },
    {
      command: "node",
      args: [distEntry, "--help"]
    }
  ];

  for (const attempt of attempts) {
    try {
      const { stdout, stderr } = await execFileAsync(attempt.command, attempt.args, {
        cwd: context.rootDir,
        timeout: 5_000,
        maxBuffer: 1024 * 1024
      });
      const output = stripAnsi(`${stdout}${stderr}`.trim());
      if (output) {
        return output;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function resolveBinEntry(bin: PackageJsonShape["bin"]): string | null {
  if (typeof bin === "string") {
    return bin;
  }

  const firstEntry = Object.values(bin ?? {})[0];
  return typeof firstEntry === "string" ? firstEntry : null;
}

async function resolveDevEntry(rootDir: string, binEntry: string): Promise<string> {
  if (binEntry.startsWith("src/") || binEntry.startsWith("./src/")) {
    return binEntry;
  }

  const normalized = binEntry.replace(/^\.\//, "");
  const srcCandidate = normalized
    .replace(/^dist\//, "src/")
    .replace(/\.js$/, ".ts");

  if (srcCandidate !== normalized && (await pathExists(path.join(rootDir, srcCandidate)))) {
    return srcCandidate;
  }

  return binEntry;
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}
