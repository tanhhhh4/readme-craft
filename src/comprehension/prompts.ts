import type { ProjectContext, ProjectUnderstanding } from "../types/index.js";

export function initialUnderstandingPrompt(context: ProjectContext, language: string): string {
  return [
    `You are analyzing a software project to prepare a README in ${language}.`,
    "Return JSON only with keys: oneLiner, problem, solution, architecture, keyFeatures, targetAudience, techHighlights.",
    "Use concise, technically precise language and do not invent ungrounded details.",
    JSON.stringify(
      {
        name: context.name,
        projectType: context.projectType,
        language: context.language,
        framework: context.framework,
        packageManager: context.packageManager,
        scripts: context.scripts,
        entryPoints: context.entryPoints,
        dependencies: context.dependencies.slice(0, 20),
        routeEndpoints: context.routeEndpoints,
        coreModules: context.coreModules.slice(0, 8).map((module) => ({
          file: module.file,
          summary: module.summary
        }))
      },
      null,
      2
    )
  ].join("\n\n");
}

export function entryPointPrompt(
  context: ProjectContext,
  entrySource: Array<{ file: string; content: string }>,
  current: ProjectUnderstanding
): string {
  return [
    "Refine the current understanding using the project entry files.",
    "Return JSON only with the same keys. Improve accuracy and keep statements grounded in the source.",
    JSON.stringify({ current, entrySource, entryPoints: context.entryPoints }, null, 2)
  ].join("\n\n");
}

export function modulesPrompt(current: ProjectUnderstanding, context: ProjectContext): string {
  return [
    "Refine the README understanding based on key modules and exported APIs.",
    "Return JSON only with the same keys, enriching architecture and feature details.",
    JSON.stringify(
      {
        current,
        coreModules: context.coreModules.slice(0, 10),
        routeEndpoints: context.routeEndpoints
      },
      null,
      2
    )
  ].join("\n\n");
}

export function docsPrompt(current: ProjectUnderstanding, context: ProjectContext): string {
  return [
    "Refine the understanding using existing docs and meaningful code comments.",
    "Return ONLY a valid JSON object with the same keys (oneLiner, problem, solution, architecture, keyFeatures, targetAudience, techHighlights). No explanation, no markdown, no extra text.",
    JSON.stringify(
      {
        current,
        existingDocs: context.existingDocs.slice(0, 10),
        codeComments: context.codeComments.slice(0, 20)
      },
      null,
      2
    )
  ].join("\n\n");
}
