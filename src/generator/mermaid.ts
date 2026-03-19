import type { AIProvider } from "../ai/provider.js";
import type { InsightsResult, ProjectContext, ProjectUnderstanding } from "../types/index.js";

export async function generateMermaidDiagram(
  provider: AIProvider,
  context: ProjectContext,
  understanding: ProjectUnderstanding,
  insights: InsightsResult
): Promise<string> {
  const raw = await provider.complete(
    [
      {
        role: "system",
        content: "You generate valid Mermaid flowchart code and output only raw Mermaid."
      },
      {
        role: "user",
        content: [
          "Generate a Mermaid flowchart for this project.",
          "Requirements:",
          "- Base it on the provided modules, entry points, and dependencies.",
          "- Use `flowchart LR`.",
          "- Keep it concise: at most 15 nodes.",
          "- Use real file names or module names from the context. Do not invent generic labels like Backend, Service, Processor, or Main Module unless they already exist.",
          "- Output pure Mermaid code only. No markdown fences. No explanation.",
          JSON.stringify(
            {
              project: {
                name: context.name,
                projectType: context.projectType,
                entryPoints: context.entryPoints,
                coreModules: context.coreModules.slice(0, 12),
                dependencies: context.dependencies,
                scripts: context.scripts,
                routeEndpoints: context.routeEndpoints
              },
              understanding,
              insights
            },
            null,
            2
          )
        ].join("\n")
      }
    ],
    { temperature: 0.2 }
  );

  const diagram = sanitizeMermaid(raw);
  if (!diagram || !isValidMermaid(diagram)) {
    throw new Error("Invalid Mermaid diagram generated");
  }

  return diagram;
}

function sanitizeMermaid(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
  return (fenceMatch?.[1] ?? trimmed).trim();
}

function isValidMermaid(diagram: string): boolean {
  const lines = diagram
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2 || lines[0] !== "flowchart LR") {
    return false;
  }

  const nodeIds = new Set<string>();
  for (const line of lines.slice(1)) {
    if (line.startsWith("%%")) {
      continue;
    }

    const matches = line.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\s*(?:\[[^\]]+\]|\([^)]+\)|\{[^}]+\})?/g);
    for (const match of matches) {
      const id = match[1];
      if (id && !isMermaidKeyword(id)) {
        nodeIds.add(id);
      }
    }
  }

  return nodeIds.size > 0 && nodeIds.size <= 15;
}

function isMermaidKeyword(value: string): boolean {
  return new Set([
    "subgraph",
    "end",
    "classDef",
    "class",
    "style",
    "linkStyle",
    "click"
  ]).has(value);
}
