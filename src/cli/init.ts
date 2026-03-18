import inquirer from "inquirer";
import path from "node:path";
import { createAIProvider } from "../ai/index.js";
import { buildProjectUnderstanding } from "../comprehension/index.js";
import { generateReadmeSections } from "../generator/index.js";
import { buildProjectInsights } from "../insights/index.js";
import { planReadmeOutline } from "../planner/index.js";
import { scanProject } from "../scanner/index.js";
import type { InitOptions, Snapshot } from "../types/index.js";
import { loadConfig } from "../utils/config.js";
import { ensureDir, writeText } from "../utils/fs.js";
import { log } from "../utils/log.js";
import { previewMarkdown, renderReadme } from "../utils/markdown.js";

export async function runInitCommand(options: InitOptions): Promise<void> {
  const config = await loadConfig(options);
  const targetDir = path.resolve(options.targetDir);
  const outputPath = path.resolve(targetDir, config.outputFile);

  log.step(`Scanning project: ${targetDir}`);
  const projectContext = await scanProject(targetDir);
  log.success(`Detected ${projectContext.language} ${projectContext.projectType} project`);

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

  log.step("Planning README outline");
  const outline = await planReadmeOutline(projectContext, projectUnderstanding, options.yes === true);
  log.success(
    `Selected ${outline.sections.filter((section) => section.enabled).length} README sections`
  );

  log.step("Generating README sections");
  const sections = await generateReadmeSections(
    provider,
    projectContext,
    projectUnderstanding,
    insights,
    outline,
    config.language,
    config.maxRegenerationAttempts
  );

  sections.forEach((section) => {
    if (section.quality.overallScore < 7) {
      log.warn(`${section.title} final score ${section.quality.overallScore}/10`);
      return;
    }
    log.success(`${section.title} scored ${section.quality.overallScore}/10`);
  });

  const markdown = renderReadme(projectContext, projectUnderstanding, outline, sections);
  console.log("\n========== README Preview ==========\n");
  console.log(previewMarkdown(markdown));
  console.log("\n====================================\n");

  const shouldWrite =
    options.yes ||
    (
      await inquirer.prompt<{ confirmWrite: boolean }>([
        {
          type: "confirm",
          name: "confirmWrite",
          message: `Write README to ${outputPath}?`,
          default: true
        }
      ])
    ).confirmWrite;

  if (!shouldWrite) {
    log.warn("Aborted before writing README.");
    return;
  }

  await writeText(outputPath, markdown);
  await saveSnapshot(targetDir, outputPath, {
    generatedAt: new Date().toISOString(),
    projectContext,
    projectUnderstanding,
    insights,
    outline,
    readmePath: outputPath
  });
  log.success(`README written to ${outputPath}`);
}

async function saveSnapshot(targetDir: string, outputPath: string, snapshot: Snapshot): Promise<void> {
  const metadataDir = path.join(targetDir, ".readme-craft");
  await ensureDir(metadataDir);
  await writeText(path.join(metadataDir, "snapshot.json"), JSON.stringify(snapshot, null, 2));
  await writeText(path.join(metadataDir, "last-output.txt"), outputPath);
}
