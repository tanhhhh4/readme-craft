import type { AIProvider } from "../ai/provider.js";
import type {
  GeneratedSection,
  InsightsResult,
  OutlineSection,
  PlannedOutline,
  ProjectContext,
  ProjectUnderstanding,
  QualityCheck
} from "../types/index.js";
import { reviewSectionQuality } from "../reviewer/index.js";
import { buildSectionPrompt } from "./sections/index.js";

export async function generateReadmeSections(
  provider: AIProvider,
  context: ProjectContext,
  understanding: ProjectUnderstanding,
  insights: InsightsResult,
  outline: PlannedOutline,
  language: string,
  maxRegenerationAttempts: number
): Promise<GeneratedSection[]> {
  const results: GeneratedSection[] = [];

  for (const section of outline.sections.filter((item) => item.enabled)) {
    results.push(
      await generateSingleSection(
        provider,
        context,
        understanding,
        insights,
        section,
        language,
        maxRegenerationAttempts
      )
    );
  }

  return results;
}

async function generateSingleSection(
  provider: AIProvider,
  context: ProjectContext,
  understanding: ProjectUnderstanding,
  insights: InsightsResult,
  section: OutlineSection,
  language: string,
  maxRegenerationAttempts: number
): Promise<GeneratedSection> {
  let attempts = 0;
  let lastContent = "";
  let quality: QualityCheck = {
    hasInstallSteps: false,
    installStepsRunnable: false,
    hasCodeExamples: false,
    linksValid: true,
    badgesCorrect: true,
    noPlaceholders: true,
    clarity: 1,
    completeness: 1,
    accuracy: 1,
    actionability: 1,
    overallScore: 1,
    issues: ["内容尚未生成"]
  };

  while (attempts <= maxRegenerationAttempts) {
    attempts += 1;
    const prompt = await buildSectionPrompt(section, context, understanding, insights, language);
    const regenerationHint =
      attempts === 1 || lastContent.length === 0
        ? ""
        : `\n\n上一次草稿的问题：${quality.issues.join("；")}\n请修正这些问题后重写。`;
    lastContent = await provider.complete(
      [
        {
          role: "system",
          content:
            "You are a senior developer writing a README for your own project. Write with authority and specificity. Avoid generic descriptions. Every non-obvious claim must be backed by concrete details from the codebase. Write for a smart developer who has 5 minutes to decide whether to use the project."
        },
        {
          role: "user",
          content: `${prompt}${regenerationHint}`
        }
      ],
      { temperature: 0.35 }
    );

    quality = await reviewSectionQuality(
      provider,
      section,
      lastContent,
      context,
      understanding,
      insights,
      language
    );

    if (quality.overallScore >= 7) {
      break;
    }
  }

  return {
    id: section.id,
    title: section.title,
    content: lastContent.trim(),
    attempts,
    quality
  };
}
