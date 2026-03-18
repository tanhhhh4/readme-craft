import type { AIProvider } from "../ai/provider.js";
import type {
  InsightsResult,
  OutlineSection,
  ProjectContext,
  ProjectUnderstanding,
  QualityCheck
} from "../types/index.js";
import { safeParseJson } from "../utils/json.js";

export async function runAIReview(
  provider: AIProvider,
  section: OutlineSection,
  content: string,
  context: ProjectContext,
  understanding: ProjectUnderstanding,
  insights: InsightsResult,
  language: string
): Promise<Pick<QualityCheck, "clarity" | "completeness" | "accuracy" | "actionability" | "issues">> {
  const prompt = [
    `Review a README section written in ${language}.`,
    "Return ONLY strict JSON with keys: clarity, completeness, accuracy, actionability, issues.",
    "Scores must be integers 1-10. issues is an array of strings.",
    "IMPORTANT: Do not wrap the JSON in markdown code fences or any extra text.",
    "IMPORTANT: All string values must be valid JSON strings with proper escaping. Do not use unescaped double quotes inside strings.",
    "IMPORTANT: Write every item in issues in English.",
    "Judge groundedness against the provided project context and note concrete issues only.",
    "Detect anti-patterns aggressively: vague claims without evidence, repeated ideas already covered by the same section brief, duplicate information that simply repeats what another section would already cover, placeholder-style content like your-org/your-username/your-project/example-repo, placeholder URLs, and AI-sounding openings or filler like 'in today's fast-paced...' or similar boilerplate.",
    "Flag placeholder URLs or repository references such as github.com/your-org/..., github.com/your-username/..., example-repo, or your-project.",
    "Flag commands that are not supported by the project context, including install or publish commands that imply a package is available on npm when the context does not support that claim. For example, penalize `npm install -g <name>` if there is no evidence the package is published.",
    "Penalize sections that describe capabilities in abstract marketing language instead of naming scripts, files, commands, modules, limits, or data flow.",
    JSON.stringify(
      {
        section,
        content,
        context: {
          name: context.name,
          projectType: context.projectType,
          scripts: context.scripts,
          routeEndpoints: context.routeEndpoints,
          configurationFiles: context.configurationFiles,
          coreModules: context.coreModules.slice(0, 8)
        },
        understanding,
        insights
      },
      null,
      2
    )
  ].join("\n\n");

  const raw = await provider.complete(
    [
      {
        role: "system",
        content: "You are a strict README reviewer. Respond with JSON only."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    { temperature: 0.1 }
  );

  return safeParseJson<
    Pick<QualityCheck, "clarity" | "completeness" | "accuracy" | "actionability" | "issues">
  >(raw, "reviewer response");
}
