import path from "node:path";
import type { AIProvider } from "../ai/provider.js";
import type { ProjectContext, ProjectUnderstanding } from "../types/index.js";
import { safeReadFile } from "../utils/fs.js";
import { safeParseJson } from "../utils/json.js";
import {
  docsPrompt,
  entryPointPrompt,
  initialUnderstandingPrompt,
  modulesPrompt
} from "./prompts.js";

const DEFAULT_UNDERSTANDING: ProjectUnderstanding = {
  oneLiner: "",
  problem: "",
  solution: "",
  architecture: "",
  keyFeatures: [],
  targetAudience: "",
  techHighlights: []
};

export async function buildProjectUnderstanding(
  provider: AIProvider,
  context: ProjectContext,
  language: string
): Promise<ProjectUnderstanding> {
  let understanding = await askForUnderstanding(
    provider,
    initialUnderstandingPrompt(context, language)
  );

  const entrySource = await loadEntrySources(context);
  if (entrySource.length > 0) {
    understanding = await askForUnderstanding(
      provider,
      entryPointPrompt(context, entrySource, understanding)
    );
  }

  understanding = await askForUnderstanding(provider, modulesPrompt(understanding, context));

  if (context.existingDocs.length > 0 || context.codeComments.length > 0) {
    understanding = await askForUnderstanding(provider, docsPrompt(understanding, context));
  }

  return normalizeUnderstanding(understanding, context);
}

async function askForUnderstanding(
  provider: AIProvider,
  prompt: string
): Promise<ProjectUnderstanding> {
  const raw = await provider.complete(
    [
      {
        role: "system",
        content: "You analyze projects and respond with strict JSON."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    { temperature: 0.1 }
  );

  return parseJson<ProjectUnderstanding>(raw);
}

async function loadEntrySources(
  context: ProjectContext
): Promise<Array<{ file: string; content: string }>> {
  const results: Array<{ file: string; content: string }> = [];

  for (const entryPoint of context.entryPoints) {
    const absolutePath = path.join(context.rootDir, entryPoint);
    const content = await safeReadFile(absolutePath);
    if (!content) {
      continue;
    }

    results.push({
      file: entryPoint,
      content: content.split("\n").slice(0, 220).join("\n")
    });
  }

  return results.slice(0, 4);
}

function normalizeUnderstanding(
  understanding: ProjectUnderstanding,
  context: ProjectContext
): ProjectUnderstanding {
  return {
    oneLiner: understanding.oneLiner || `${context.name} is a ${context.projectType} project.`,
    problem: understanding.problem || "The project solves a workflow or developer productivity problem.",
    solution: understanding.solution || "It packages the project logic into a reusable workflow.",
    architecture:
      understanding.architecture || "The codebase is organized around entry points, core modules, and configuration.",
    keyFeatures: understanding.keyFeatures?.filter(Boolean) ?? [],
    targetAudience: understanding.targetAudience || "Developers working with this project.",
    techHighlights: understanding.techHighlights?.filter(Boolean) ?? []
  };
}

function parseJson<T>(raw: string): T {
  return safeParseJson<T>(raw, "project understanding response");
}
