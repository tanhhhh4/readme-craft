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
          "- Use `flowchart TD`.",
          "- You must group modules into `subgraph` blocks by logical layers.",
          `- Use ${context.language === "zh" ? "Chinese" : "English"} subgraph titles.`,
          "- Recommended grouping pattern:",
          (context.language === "zh"
            ? "  - 入口层 (CLI commands or entry points)"
            : "  - Entry Layer (CLI commands or entry points)"),
          (context.language === "zh"
            ? "  - 扫描层 (scanner, cli-output, file discovery)"
            : "  - Scanning Layer (scanner, cli-output, file discovery)"),
          (context.language === "zh"
            ? "  - 理解层 (comprehension, insights, analysis)"
            : "  - Understanding Layer (comprehension, insights, analysis)"),
          (context.language === "zh"
            ? "  - 规划层 (planner)"
            : "  - Planning Layer (planner)"),
          (context.language === "zh"
            ? "  - 生成层 (generator, sections, mermaid)"
            : "  - Generation Layer (generator, sections, mermaid)"),
          (context.language === "zh"
            ? "  - 审查层 (reviewer, rules, validation)"
            : "  - Review Layer (reviewer, rules, validation)"),
          (context.language === "zh"
            ? "  - AI 层 (providers, model adapters)"
            : "  - AI Layer (providers, model adapters)"),
          "- Only include groups that actually exist in the project.",
          "- Each subgraph should contain real file/module nodes from the project context.",
          "- Inside a subgraph, you may connect related nodes.",
          "- Between subgraphs, draw only the main data flow.",
          "- Inter-subgraph edges must connect only from the previous group's exit node to the next group's entry node.",
          "- Do not connect every node to every other node across groups.",
          "- Keep it concise: at most 15 nodes.",
          "- Use real file names or module names from the context. Do not invent generic labels like Backend, Service, Processor, or Main Module unless they already exist.",
          "- Prefer the smallest set of nodes that still explains the true module flow.",
          "- Output pure Mermaid code only. No markdown fences. No explanation.",
          JSON.stringify(
            {
              project: {
                name: context.name,
                language: context.language,
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
  if (lines.length < 2 || lines[0] !== "flowchart TD") {
    return false;
  }

  const nodeIds = new Set<string>();
  let subgraphCount = 0;
  for (const line of lines.slice(1)) {
    if (line.startsWith("%%")) {
      continue;
    }

    if (line.startsWith("subgraph ")) {
      subgraphCount += 1;
    }

    const matches = line.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\s*(?:\[[^\]]+\]|\([^)]+\)|\{[^}]+\})?/g);
    for (const match of matches) {
      const id = match[1];
      if (id && !isMermaidKeyword(id)) {
        nodeIds.add(id);
      }
    }
  }

  return subgraphCount > 0 && nodeIds.size > 0 && nodeIds.size <= 15;
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
