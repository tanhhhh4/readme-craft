import type { AIProvider } from "../ai/provider.js";
import type {
  InsightsResult,
  OutlineSection,
  ProjectContext,
  ProjectUnderstanding,
  QualityCheck
} from "../types/index.js";
import { runAIReview } from "./ai-review.js";
import { runRuleChecks } from "./rules.js";

export async function reviewSectionQuality(
  provider: AIProvider,
  section: OutlineSection,
  content: string,
  context: ProjectContext,
  understanding: ProjectUnderstanding,
  insights: InsightsResult,
  language: string
): Promise<QualityCheck> {
  const ruleChecks = runRuleChecks(section, content, context, understanding);
  const aiReview =
    content.trim().length === 0
      ? {
          clarity: 1,
          completeness: 1,
          accuracy: 1,
          actionability: 1,
          issues: ["Section is empty."]
        }
      : await runAIReview(provider, section, content, context, understanding, insights, language);

  const penalty =
    [ruleChecks.hasInstallSteps, ruleChecks.installStepsRunnable, ruleChecks.hasCodeExamples, ruleChecks.linksValid, ruleChecks.badgesCorrect, ruleChecks.noPlaceholders].filter(Boolean).length /
    6;
  const average =
    (aiReview.clarity + aiReview.completeness + aiReview.accuracy + aiReview.actionability) / 4;
  const overallScore = Number((average * 0.8 + penalty * 10 * 0.2).toFixed(1));

  return {
    ...ruleChecks,
    clarity: aiReview.clarity,
    completeness: aiReview.completeness,
    accuracy: aiReview.accuracy,
    actionability: aiReview.actionability,
    overallScore,
    issues: [...new Set([...ruleChecks.issues, ...aiReview.issues])].filter(Boolean)
  };
}
