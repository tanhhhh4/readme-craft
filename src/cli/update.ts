import path from "node:path";
import { createAIProvider } from "../ai/index.js";
import { buildProjectUnderstanding } from "../comprehension/index.js";
import { generateReadmeSections } from "../generator/index.js";
import { generateMermaidDiagram } from "../generator/mermaid.js";
import { buildProjectInsights } from "../insights/index.js";
import { planReadmeOutline } from "../planner/index.js";
import { captureCliHelp } from "../scanner/cli-output.js";
import { scanProject } from "../scanner/index.js";
import type { InitOptions, OutlineSection, Snapshot } from "../types/index.js";
import { loadConfig } from "../utils/config.js";
import { ensureDir, pathExists, safeReadFile, writeText } from "../utils/fs.js";
import { log } from "../utils/log.js";
import { parseReadmeSections, upsertArchitectureSection } from "../utils/markdown.js";
import { buildSnapshot, readSnapshot, saveSnapshot } from "../utils/snapshot.js";

export async function runUpdateCommand(options: InitOptions): Promise<void> {
  const config = await loadConfig(options);
  const targetDir = path.resolve(options.targetDir);
  const outputPath = await resolveReadmePath(targetDir, config.outputFile);
  const existingMarkdown = await safeReadFile(outputPath);
  if (!existingMarkdown) {
    throw new Error(`README not found at ${outputPath}. Run init first or specify --output.`);
  }

  const previousSnapshot = await readSnapshot(targetDir);
  if (!previousSnapshot) {
    throw new Error(`Snapshot not found in ${path.join(targetDir, ".readme-craft")}. Run init first.`);
  }

  log.step(`Scanning project: ${targetDir}`);
  const projectContext = await scanProject(targetDir);
  log.success(`Detected ${projectContext.language} ${projectContext.projectType} project`);

  const cliHelpOutput = await captureCliHelp(projectContext);
  if (cliHelpOutput) {
    projectContext.cliHelpOutput = cliHelpOutput;
    log.success("Captured live CLI help output");
  }

  const currentSnapshot = await buildSnapshot(projectContext);
  const sectionIdsToUpdate = detectChangedSections(previousSnapshot, currentSnapshot);
  if (sectionIdsToUpdate.length === 0) {
    await saveSnapshot(targetDir, currentSnapshot);
    log.success("No incremental README updates were needed");
    return;
  }

  log.step(`Building project understanding with ${config.model.provider}/${config.model.model}`);
  const provider = createAIProvider(config);
  const projectUnderstanding = await buildProjectUnderstanding(
    provider,
    projectContext,
    config.language
  );
  log.success("Project understanding complete");

  log.step("Extracting project insights");
  const insights = await buildProjectInsights(provider, projectContext, projectUnderstanding, config.language);
  log.success("Project insights complete");

  if (sectionIdsToUpdate.includes("structure")) {
    try {
      projectContext.mermaidDiagram = await generateMermaidDiagram(
        provider,
        projectContext,
        projectUnderstanding,
        insights
      );
      log.success("Generated Mermaid architecture diagram");
    } catch {
      delete projectContext.mermaidDiagram;
    }
  }

  const outline = await planReadmeOutline(projectContext, projectUnderstanding, true);
  const updateOutline = {
    ...outline,
    sections: outline.sections.map((section) => ({
      ...section,
      enabled: sectionIdsToUpdate.includes(section.id)
    }))
  };

  log.step(`Regenerating ${sectionIdsToUpdate.length} changed README sections`);
  const generatedSections = await generateReadmeSections(
    provider,
    projectContext,
    projectUnderstanding,
    insights,
    updateOutline,
    config.language,
    config.maxRegenerationAttempts
  );

  const mergedMarkdown = mergeReadmeSections(existingMarkdown, generatedSections, outline.sections);
  const nextMarkdown = sectionIdsToUpdate.includes("structure")
    ? upsertArchitectureSection(mergedMarkdown, projectContext.mermaidDiagram)
    : mergedMarkdown;

  await writeText(outputPath, nextMarkdown);
  await saveSnapshot(targetDir, currentSnapshot);
  await saveLastOutput(targetDir, outputPath);
  log.success(`README updated at ${outputPath}`);
}

function detectChangedSections(previousSnapshot: Snapshot, currentSnapshot: Snapshot): string[] {
  const sectionIds = new Set<string>();

  if (!isRecordEqual(previousSnapshot.dependencies, currentSnapshot.dependencies)) {
    sectionIds.add("tech-stack");
  }

  if (!isStringArrayEqual(previousSnapshot.srcFiles, currentSnapshot.srcFiles)) {
    sectionIds.add("structure");
  }

  if (
    !isRecordEqual(previousSnapshot.binEntries, currentSnapshot.binEntries) ||
    !isRecordEqual(previousSnapshot.scripts, currentSnapshot.scripts)
  ) {
    sectionIds.add("quickstart");
    sectionIds.add("usage");
  }

  if (previousSnapshot.license !== currentSnapshot.license) {
    sectionIds.add("license");
  }

  return Array.from(sectionIds);
}

function mergeReadmeSections(
  markdown: string,
  generatedSections: Array<{ title: string; content: string }>,
  outlineSections: OutlineSection[]
): string {
  const parsed = parseReadmeSections(markdown);
  const generatedByTitle = new Map(generatedSections.map((section) => [section.title, section.content.trim()]));
  const mergedSections = parsed.sections.map((section) => ({
    ...section,
    content: generatedByTitle.get(section.heading) ?? section.content.trim()
  }));

  const existingTitles = new Set(mergedSections.map((section) => section.heading));
  const missingGenerated = outlineSections
    .filter((section) => generatedByTitle.has(section.title) && !existingTitles.has(section.title))
    .map((section) => generatedByTitle.get(section.title))
    .filter((content): content is string => Boolean(content));

  const body = [...mergedSections.map((section) => section.content.trim()), ...missingGenerated].join(
    "\n\n---\n\n"
  );
  if (!parsed.preamble.trim()) {
    return `${body}\n`;
  }

  return `${parsed.preamble}\n\n---\n\n${body}\n`;
}

async function resolveReadmePath(targetDir: string, configuredOutput: string): Promise<string> {
  const configuredPath = path.resolve(targetDir, configuredOutput);
  if (await pathExists(configuredPath)) {
    return configuredPath;
  }

  const lastOutputPath = path.join(targetDir, ".readme-craft", "last-output.txt");
  const lastOutput = await safeReadFile(lastOutputPath);
  if (lastOutput?.trim()) {
    return path.resolve(targetDir, lastOutput.trim());
  }

  return configuredPath;
}

function isRecordEqual(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

function isStringArrayEqual(left: string[], right: string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

async function saveLastOutput(targetDir: string, outputPath: string): Promise<void> {
  const metadataDir = path.join(targetDir, ".readme-craft");
  await ensureDir(metadataDir);
  await writeText(path.join(metadataDir, "last-output.txt"), outputPath);
}
