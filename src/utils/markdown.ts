import fs from "node:fs";
import path from "node:path";
import type {
  GeneratedSection,
  PlannedOutline,
  ProjectContext,
  ProjectUnderstanding
} from "../types/index.js";

export interface ReadmeSectionBlock {
  heading: string;
  content: string;
  start: number;
  end: number;
}

export function renderReadme(
  context: ProjectContext,
  understanding: ProjectUnderstanding,
  outline: PlannedOutline,
  sections: GeneratedSection[]
): string {
  const sectionMap = new Map(sections.map((section) => [section.id, section]));
  const enabledSections = outline.sections.filter((section) => section.enabled);
  const ordered = enabledSections
    .map((section) => sectionMap.get(section.id))
    .filter((section): section is GeneratedSection => Boolean(section));

  const badges = buildBadges(context);
  const navigation = buildNavigation(enabledSections);
  const frontMatter = [
    `<h1 align="center">${escapeHtml(context.name)}</h1>`,
    `<p align="center">${escapeHtml(understanding.oneLiner)}</p>`,
    badges ? `<p align="center">${badges}</p>` : "",
    navigation ? `<p align="center">\n  ${navigation}\n</p>` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const bodySections = ordered.map((section) => section.content.trim());
  const body = insertArchitectureSection(bodySections, context.mermaidDiagram).join("\n\n---\n\n");
  return `${frontMatter}\n\n---\n\n${body}\n`;
}

export function previewMarkdown(markdown: string, maxLength = 4000): string {
  if (markdown.length <= maxLength) {
    return markdown;
  }

  return `${markdown.slice(0, maxLength)}\n\n... [truncated preview]`;
}

function buildBadges(context: ProjectContext): string {
  const packageJson = readPackageJson(context.rootDir);
  const badges: string[] = [];

  if (context.license) {
    badges.push(
      renderBadge(
        "License",
        `https://img.shields.io/badge/license-${encodeBadgeValue(context.license)}-blue.svg`
      )
    );
  }

  const nodeVersion = packageJson?.engines?.node;
  if (nodeVersion) {
    badges.push(
      renderBadge(
        "Node Version",
        `https://img.shields.io/badge/node-${encodeBadgeValue(nodeVersion)}-339933.svg`
      )
    );
  }

  if (context.language.toLowerCase().includes("typescript")) {
    badges.push(renderBadge("TypeScript", "https://img.shields.io/badge/language-TypeScript-3178C6.svg"));
  }

  return badges.join("\n  ");
}

export function parseReadmeSections(markdown: string): {
  preamble: string;
  sections: ReadmeSectionBlock[];
} {
  const headingPattern = /^##\s+(.+)$/gm;
  const matches = Array.from(markdown.matchAll(headingPattern));
  if (matches.length === 0) {
    return {
      preamble: markdown,
      sections: []
    };
  }

  const sections = matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? markdown.length;
    return {
      heading: (match[1] ?? "").trim(),
      content: markdown.slice(start, end).trim(),
      start,
      end
    };
  });

  return {
    preamble: markdown.slice(0, matches[0]?.index ?? 0).trimEnd(),
    sections
  };
}

export function upsertArchitectureSection(markdown: string, mermaidDiagram?: string): string {
  const diagram = mermaidDiagram?.trim();
  if (!diagram) {
    return markdown;
  }

  const architectureBlock = diagram
    ? `## 架构概览\n\n\`\`\`mermaid\n${diagram}\n\`\`\``
    : "";
  const parsed = parseReadmeSections(markdown);
  const sections = parsed.sections.filter((section) => section.heading !== "架构概览");
  const overviewIndex = sections.findIndex((section) => section.heading === "项目简介");
  const nextSections = [...sections];

  if (architectureBlock && overviewIndex >= 0) {
    nextSections.splice(overviewIndex + 1, 0, {
      heading: "架构概览",
      content: architectureBlock,
      start: 0,
      end: 0
    });
  }

  if (architectureBlock && overviewIndex < 0) {
    nextSections.unshift({
      heading: "架构概览",
      content: architectureBlock,
      start: 0,
      end: 0
    });
  }

  const body = nextSections.map((section) => section.content.trim()).join("\n\n---\n\n");
  if (!parsed.preamble.trim()) {
    return body ? `${body}\n` : "";
  }

  return body ? `${parsed.preamble}\n\n---\n\n${body}\n` : `${parsed.preamble}\n`;
}

function buildNavigation(sections: PlannedOutline["sections"]): string {
  return sections
    .map((section) => `<a href="#${buildAnchor(section.title)}">${escapeHtml(section.title)}</a>`)
    .join(" •\n  ");
}

function buildAnchor(title: string): string {
  return title.trim().replace(/\s+/g, "-").toLowerCase();
}

function insertArchitectureSection(bodySections: string[], mermaidDiagram?: string): string[] {
  if (!mermaidDiagram?.trim()) {
    return bodySections;
  }

  const architectureSection = `## 架构概览\n\n\`\`\`mermaid\n${mermaidDiagram.trim()}\n\`\`\``;
  const overviewIndex = bodySections.findIndex((content) => content.startsWith("## 项目简介"));
  if (overviewIndex >= 0) {
    const nextSections = [...bodySections];
    nextSections.splice(overviewIndex + 1, 0, architectureSection);
    return nextSections;
  }

  return [architectureSection, ...bodySections];
}

function encodeBadgeValue(value: string): string {
  return encodeURIComponent(value).replace(/-/g, "--");
}

function renderBadge(label: string, src: string): string {
  return `<img alt="${escapeHtml(label)}" src="${src}" />`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readPackageJson(rootDir: string): {
  engines?: {
    node?: string;
  };
} | null {
  try {
    const raw = fs.readFileSync(path.join(rootDir, "package.json"), "utf8");
    return JSON.parse(raw) as {
      engines?: {
        node?: string;
      };
    };
  } catch {
    return null;
  }
}
