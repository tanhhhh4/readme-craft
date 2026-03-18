import type { OutlineSection, ProjectContext, ProjectUnderstanding, QualityCheck } from "../types/index.js";

export function runRuleChecks(
  section: OutlineSection,
  content: string,
  context: ProjectContext,
  understanding: ProjectUnderstanding
): Pick<
  QualityCheck,
  | "hasInstallSteps"
  | "installStepsRunnable"
  | "hasCodeExamples"
  | "linksValid"
  | "badgesCorrect"
  | "noPlaceholders"
  | "issues"
> {
  const issues: string[] = [];
  const hasInstallSteps = /npm|pnpm|yarn|bun|node/i.test(content) || section.id !== "quickstart";
  const installStepsRunnable =
    section.id !== "quickstart" ||
    Object.keys(context.scripts).length === 0 ||
    /npm run|pnpm |yarn |node /i.test(content);
  const hasCodeExamples = /```/.test(content) || !["usage", "api"].includes(section.id);
  const linksValid = Array.from(content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)).every((match) => {
    const href = match[1];
    if (!href) {
      return false;
    }
    return /^(https?:\/\/|\.?\/|#)/.test(href);
  });
  const badgesCorrect =
    section.id !== "overview" || !/shields\.io/.test(content) || /\[[^\]]+\]\(https?:\/\/[^\s)]+\)/.test(content);
  const noPlaceholders =
    !/\[TODO\]|\bTBD\b|lorem ipsum|your-org|your-username|your-project|example-repo|todo:/i.test(content);

  if (!hasInstallSteps) {
    issues.push("缺少可执行的安装或运行步骤");
  }

  if (!installStepsRunnable) {
    issues.push("命令看起来不可直接执行");
  }

  if (!hasCodeExamples) {
    issues.push("缺少示例代码或命令块");
  }

  if (!linksValid) {
    issues.push("Markdown 链接格式不合法");
  }

  if (!badgesCorrect) {
    issues.push("徽章链接格式不正确");
  }

  if (!noPlaceholders) {
    issues.push("存在占位符内容");
  }

  if (section.id === "overview" && !content.includes(understanding.oneLiner)) {
    issues.push("没有准确体现项目一句话定位");
  }

  return {
    hasInstallSteps,
    installStepsRunnable,
    hasCodeExamples,
    linksValid,
    badgesCorrect,
    noPlaceholders,
    issues
  };
}
