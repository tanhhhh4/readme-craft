import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { simpleGit } from "simple-git";
import type {
  CommentInfo,
  Dep,
  FunctionSignature,
  ModuleInfo,
  ProjectContext
} from "../types/index.js";
import { buildDirectoryTree, listFiles, pathExists, readJsonFile, safeReadFile } from "../utils/fs.js";
import { inferProjectType } from "../utils/project-type.js";

interface PackageJsonShape {
  name?: string;
  version?: string;
  main?: string;
  bin?: string | Record<string, string>;
  type?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  license?: string;
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

export async function scanNodeProject(rootDir: string): Promise<ProjectContext> {
  const packageJsonPath = path.join(rootDir, "package.json");
  if (!(await pathExists(packageJsonPath))) {
    throw new Error(`No package.json found in ${rootDir}`);
  }

  const packageJson = await readJsonFile<PackageJsonShape>(packageJsonPath);
  const tsconfigPath = path.join(rootDir, "tsconfig.json");
  const packageManager = await detectPackageManager(rootDir);
  const docs = await listFiles(rootDir, (filePath) => filePath.endsWith(".md"));
  const sourceFiles = await listFiles(rootDir, (filePath) =>
    SOURCE_EXTENSIONS.has(path.extname(filePath))
  );
  const structure = await buildDirectoryTree(rootDir);
  const comments = await collectComments(rootDir, sourceFiles);
  const routeScan = await collectRouteHints(rootDir, sourceFiles);
  const gitSummary = await collectGitSummary(rootDir);
  const entryPoints = detectEntryPoints(packageJson);
  const frameworks = detectFrameworks(packageJson);
  const coreModules = await collectCoreModules(rootDir, sourceFiles, gitSummary.hotFiles);
  const license = await detectLicense(rootDir, packageJson);
  const configurationFiles = await collectConfigurationFiles(rootDir);
  const name = packageJson.name ?? path.basename(rootDir);
  const hasBin = Boolean(packageJson.bin);

  return {
    rootDir,
    projectType: inferProjectType(hasBin, frameworks, routeScan.routeEndpoints),
    name,
    language: (await pathExists(tsconfigPath)) ? "TypeScript" : "JavaScript",
    framework: frameworks,
    packageManager,
    entryPoints,
    structure,
    coreModules,
    dependencies: mapDeps(packageJson.dependencies),
    devDependencies: mapDeps(packageJson.devDependencies),
    scripts: packageJson.scripts ?? {},
    existingDocs: docs.map((filePath) => path.relative(rootDir, filePath)),
    codeComments: comments,
    license,
    contributors: gitSummary.contributors,
    lastCommit: gitSummary.lastCommit,
    hotFiles: gitSummary.hotFiles,
    routeEndpoints: routeScan.routeEndpoints,
    configurationFiles
  };
}

async function detectPackageManager(rootDir: string): Promise<string> {
  const candidates: Array<[string, string]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"]
  ];

  for (const [fileName, label] of candidates) {
    if (await pathExists(path.join(rootDir, fileName))) {
      return label;
    }
  }

  return "npm";
}

function detectEntryPoints(packageJson: PackageJsonShape): string[] {
  const entryPoints = new Set<string>();
  if (packageJson.main) {
    entryPoints.add(packageJson.main);
  }

  if (typeof packageJson.bin === "string") {
    entryPoints.add(packageJson.bin);
  } else if (packageJson.bin) {
    Object.values(packageJson.bin).forEach((value) => entryPoints.add(value));
  }

  ["src/index.ts", "src/index.js", "index.ts", "index.js", "src/main.ts", "src/main.js"].forEach(
    (candidate) => entryPoints.add(candidate)
  );

  return Array.from(entryPoints);
}

function detectFrameworks(packageJson: PackageJsonShape): string[] {
  const deps = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {})
  ]);

  const knownFrameworks = [
    "express",
    "fastify",
    "koa",
    "hono",
    "react",
    "next",
    "vue",
    "vite",
    "nestjs",
    "commander"
  ];

  return knownFrameworks.filter((item) => deps.has(item));
}

function mapDeps(dependencies: Record<string, string> | undefined): Dep[] {
  return Object.entries(dependencies ?? {}).map(([name, version]) => ({ name, version }));
}

async function collectComments(rootDir: string, sourceFiles: string[]): Promise<CommentInfo[]> {
  const comments: CommentInfo[] = [];
  for (const filePath of sourceFiles.slice(0, 40)) {
    const content = await safeReadFile(filePath);
    if (!content) {
      continue;
    }

    const lines = content.split("\n");
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/**") ||
        trimmed.startsWith("/*")
      ) {
        const text = trimmed.replace(/^\/\*+\s?/, "").replace(/^\*+\s?/, "").replace(/\*\/$/, "");
        if (text.length >= 16) {
          comments.push({
            file: path.relative(rootDir, filePath),
            line: index + 1,
            text
          });
        }
      }
    });
  }

  return comments.slice(0, 80);
}

async function collectRouteHints(
  rootDir: string,
  sourceFiles: string[]
): Promise<{ routeEndpoints: string[] }> {
  const routeEndpoints = new Set<string>();
  const routePattern =
    /\b(?:app|router|server)\.(get|post|put|patch|delete|options|head)\s*\(\s*["'`]([^"'`]+)["'`]/g;

  for (const filePath of sourceFiles) {
    const content = await safeReadFile(filePath);
    if (!content) {
      continue;
    }

    let match: RegExpExecArray | null;
    while ((match = routePattern.exec(content)) !== null) {
      const method = match[1];
      const routePath = match[2];
      if (method && routePath) {
        routeEndpoints.add(`${method.toUpperCase()} ${routePath}`);
      }
    }
  }

  return {
    routeEndpoints: Array.from(routeEndpoints).sort()
  };
}

async function collectGitSummary(rootDir: string): Promise<{
  contributors: number;
  lastCommit: string | null;
  hotFiles: string[];
}> {
  if (!(await pathExists(path.join(rootDir, ".git")))) {
    return {
      contributors: 0,
      lastCommit: null,
      hotFiles: []
    };
  }

  const git = simpleGit(rootDir);
  try {
    const [contributorsRaw, logRaw, lastCommit] = await Promise.all([
      git.raw(["shortlog", "-sn", "HEAD"]),
      git.raw(["log", "--name-only", "--pretty=format:", "--since=180.days"]),
      git.log({ maxCount: 1 })
    ]);

    const contributors = contributorsRaw
      .split("\n")
      .map((line: string) => line.trim())
      .filter(Boolean).length;
    const counts = new Map<string, number>();
    logRaw
      .split("\n")
      .map((line: string) => line.trim())
      .filter(Boolean)
      .forEach((file: string) => {
        counts.set(file, (counts.get(file) ?? 0) + 1);
      });

    const hotFiles = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([file]) => file);

    return {
      contributors,
      lastCommit: lastCommit.latest?.date ?? null,
      hotFiles
    };
  } catch {
    return {
      contributors: 0,
      lastCommit: null,
      hotFiles: []
    };
  }
}

async function collectCoreModules(
  rootDir: string,
  sourceFiles: string[],
  hotFiles: string[]
): Promise<ModuleInfo[]> {
  const hotFileSet = new Map(hotFiles.map((filePath, index) => [normalizePath(filePath), 12 - index]));
  const modules: ModuleInfo[] = [];

  for (const filePath of sourceFiles.slice(0, 50)) {
    const content = await safeReadFile(filePath);
    if (!content) {
      continue;
    }

    const exports = extractFunctionSignatures(filePath, content);
    const relativePath = path.relative(rootDir, filePath);
    const routeHints = Array.from(
      content.matchAll(/(?:get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)/g)
    )
      .map((match) => match[1])
      .filter((value): value is string => Boolean(value));
    const importance = hotFileSet.get(normalizePath(relativePath)) ?? Math.min(exports.length, 6);

    if (exports.length === 0 && routeHints.length === 0 && importance === 0) {
      continue;
    }

    modules.push({
      file: relativePath,
      summary: createModuleSummary(relativePath, exports, routeHints),
      exports,
      routeHints,
      importance
    });
  }

  return modules.sort((a, b) => b.importance - a.importance).slice(0, 12);
}

function extractFunctionSignatures(filePath: string, content: string): FunctionSignature[] {
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const signatures: FunctionSignature[] = [];

  function pushSignature(signature: FunctionSignature): void {
    if (signatures.some((item) => item.name === signature.name && item.signature === signature.signature)) {
      return;
    }
    signatures.push(signature);
  }

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      pushSignature({
        name: node.name.getText(sourceFile),
        kind: "function",
        exported: hasExportModifier(node),
        signature: node.getText(sourceFile).split("{")[0]?.trim() ?? node.name.getText(sourceFile)
      });
    }

    if (ts.isClassDeclaration(node) && node.name) {
      pushSignature({
        name: node.name.getText(sourceFile),
        kind: "class",
        exported: hasExportModifier(node),
        signature: `class ${node.name.getText(sourceFile)}`
      });
    }

    if (ts.isVariableStatement(node)) {
      node.declarationList.declarations.forEach((declaration) => {
        if (ts.isIdentifier(declaration.name)) {
          pushSignature({
            name: declaration.name.getText(sourceFile),
            kind: "const",
            exported: hasExportModifier(node),
            signature: declaration.getText(sourceFile)
          });
        }
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return signatures.slice(0, 20);
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }

  return Boolean(
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function createModuleSummary(
  relativePath: string,
  exports: FunctionSignature[],
  routeHints: string[]
): string {
  const exportNames = exports.slice(0, 4).map((item) => item.name).join(", ");
  if (routeHints.length > 0) {
    return `${relativePath} defines API handlers for ${routeHints.slice(0, 4).join(", ")}.`;
  }

  if (exportNames) {
    return `${relativePath} exposes ${exportNames}.`;
  }

  return `${relativePath} is part of the project runtime.`;
}

async function detectLicense(rootDir: string, packageJson: PackageJsonShape): Promise<string> {
  if (packageJson.license) {
    return packageJson.license;
  }

  const licenseFiles = ["LICENSE", "LICENSE.md", "LICENSE.txt"];
  for (const fileName of licenseFiles) {
    const filePath = path.join(rootDir, fileName);
    if (await pathExists(filePath)) {
      const content = await fs.readFile(filePath, "utf8");
      return content.split("\n")[0]?.trim() || "Custom";
    }
  }

  return "UNLICENSED";
}

async function collectConfigurationFiles(rootDir: string): Promise<string[]> {
  const candidates = [
    ".env.example",
    ".env",
    "tsconfig.json",
    "vite.config.ts",
    "next.config.js",
    "docker-compose.yml"
  ];

  const found: string[] = [];
  for (const candidate of candidates) {
    if (await pathExists(path.join(rootDir, candidate))) {
      found.push(candidate);
    }
  }
  return found;
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}
