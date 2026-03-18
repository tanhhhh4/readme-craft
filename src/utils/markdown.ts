import type {
  GeneratedSection,
  PlannedOutline,
  ProjectContext,
  ProjectUnderstanding
} from "../types/index.js";

export function renderReadme(
  context: ProjectContext,
  understanding: ProjectUnderstanding,
  outline: PlannedOutline,
  sections: GeneratedSection[]
): string {
  const sectionMap = new Map(sections.map((section) => [section.id, section]));
  const ordered = outline.sections
    .filter((section) => section.enabled)
    .map((section) => sectionMap.get(section.id))
    .filter((section): section is GeneratedSection => Boolean(section));

  const frontMatter = `# ${context.name}\n\n> ${understanding.oneLiner}\n`;
  const body = ordered.map((section) => section.content.trim()).join("\n\n");
  return `${frontMatter}\n${body}\n`;
}

export function previewMarkdown(markdown: string, maxLength = 4000): string {
  if (markdown.length <= maxLength) {
    return markdown;
  }

  return `${markdown.slice(0, maxLength)}\n\n... [truncated preview]`;
}
