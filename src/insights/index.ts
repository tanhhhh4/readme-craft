import path from "node:path";
import type { AIProvider } from "../ai/provider.js";
import type { InsightsResult, ProjectContext, ProjectUnderstanding } from "../types/index.js";
import { safeReadFile } from "../utils/fs.js";
import { safeParseJson } from "../utils/json.js";

const DEFAULT_INSIGHTS: InsightsResult = {
  summary: "",
  usp: [],
  designDecisions: [],
  notablePatterns: [],
  evidence: [],
  recommendedAngles: []
};

export async function buildProjectInsights(
  provider: AIProvider,
  context: ProjectContext,
  understanding: ProjectUnderstanding,
  language: string
): Promise<InsightsResult> {
  const evidence = await collectInsightEvidence(context);
  const prompt = [
    `Analyze this ${language} project and extract README-worthy insights as strict JSON.`,
    "Return ONLY JSON with keys: summary, usp, designDecisions, notablePatterns, evidence, recommendedAngles.",
    "Each array should contain 2-5 concrete items. No markdown. No extra text.",
    "Focus on differentiated value, architecture tradeoffs, notable implementation patterns, and claims that can be defended with code evidence.",
    JSON.stringify(
      {
        context: {
          name: context.name,
          projectType: context.projectType,
          packageManager: context.packageManager,
          entryPoints: context.entryPoints,
          scripts: context.scripts,
          dependencies: context.dependencies,
          devDependencies: context.devDependencies,
          configurationFiles: context.configurationFiles,
          routeEndpoints: context.routeEndpoints,
          hotFiles: context.hotFiles,
          coreModules: context.coreModules
        },
        understanding,
        evidence
      },
      null,
      2
    )
  ].join("\n\n");

  const raw = await provider.complete(
    [
      {
        role: "system",
        content: "You analyze codebases and respond with strict JSON grounded in evidence."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    { temperature: 0.15 }
  );

  return normalizeInsights(parseJson<InsightsResult>(raw), context, understanding, evidence);
}

async function collectInsightEvidence(context: ProjectContext): Promise<Array<{ file: string; excerpt: string }>> {
  const selectedFiles = Array.from(
    new Set(
      [
        ...context.entryPoints,
        ...context.hotFiles,
        ...context.coreModules.map((module) => module.file),
        ...context.configurationFiles
      ].filter(Boolean)
    )
  ).slice(0, 8);

  const snippets: Array<{ file: string; excerpt: string }> = [];
  for (const file of selectedFiles) {
    const absolutePath = path.join(context.rootDir, file);
    const content = await safeReadFile(absolutePath);
    if (!content) {
      continue;
    }

    snippets.push({
      file,
      excerpt: content.split("\n").slice(0, 80).join("\n")
    });
  }

  return snippets;
}

function normalizeInsights(
  insights: InsightsResult,
  context: ProjectContext,
  understanding: ProjectUnderstanding,
  evidence: Array<{ file: string; excerpt: string }>
): InsightsResult {
  const usp = uniqueNonEmpty(insights.usp);
  const designDecisions = uniqueNonEmpty(insights.designDecisions);
  const notablePatterns = uniqueNonEmpty(insights.notablePatterns);
  const recommendedAngles = uniqueNonEmpty(insights.recommendedAngles);
  const evidenceLines = uniqueNonEmpty(insights.evidence);

  return {
    summary:
      insights.summary ||
      `${context.name} stands out by combining repository scanning with iterative AI understanding instead of generating a README from a shallow prompt.`,
    usp:
      usp.length > 0
        ? usp
        : [
            "It builds README content from scanned repository evidence instead of a one-shot generic prompt.",
            "It combines generation with review-and-regenerate loops, so weak sections are rewritten automatically."
          ],
    designDecisions:
      designDecisions.length > 0
        ? designDecisions
        : [
            `The pipeline separates scanning, comprehension, planning, generation, and review so each stage can add structure instead of mixing concerns in one prompt.`,
            `The scanner records scripts, entry points, module exports, and configuration files, which gives the generator verifiable details to cite.`
          ],
    notablePatterns:
      notablePatterns.length > 0
        ? notablePatterns
        : [
            understanding.architecture,
            "The generator retries low-scoring sections using reviewer feedback as a rewrite hint."
          ].filter(Boolean),
    evidence:
      evidenceLines.length > 0
        ? evidenceLines
        : evidence
            .slice(0, 4)
            .map((item) => `${item.file} was sampled as supporting evidence for README generation.`),
    recommendedAngles:
      recommendedAngles.length > 0
        ? recommendedAngles
        : [
            "Explain why progressive comprehension produces a better README than asking an LLM to write from scratch.",
            "Call out concrete implementation details such as scan depth, review loops, or config loading behavior."
          ]
  };
}

function uniqueNonEmpty(items: string[] | undefined): string[] {
  return Array.from(new Set((items ?? []).map((item) => item.trim()).filter(Boolean)));
}

function parseJson<T>(raw: string): T {
  return safeParseJson<T>(raw, "project insights response");
}
