import path from "node:path";
import type {
  InsightsResult,
  ModuleInfo,
  OutlineSection,
  ProjectContext,
  ProjectUnderstanding,
  TreeNode
} from "../../types/index.js";
import { safeReadFile } from "../../utils/fs.js";

export async function buildSectionPrompt(
  section: OutlineSection,
  context: ProjectContext,
  understanding: ProjectUnderstanding,
  insights: InsightsResult,
  language: string
): Promise<string> {
  const sectionContext = await buildSectionContext(section, context, understanding, insights);
  const sectionRequirements = buildSectionRequirements(section, context);

  return [
    `用 ${language} 直接撰写 README 的「${section.title}」章节。`,
    "只输出可直接放进 README 的 Markdown，不要解释你的思路，不要重复项目标题。",
    "禁止空洞形容词和 AI 套话。像项目作者一样写，优先写具体命令、文件、模块、限制、数据流和设计取舍。",
    ...sectionRequirements,
    "如果上下文不足，明确写出能确认的范围，不要脑补。",
    JSON.stringify(sectionContext, null, 2)
  ].join("\n\n");
}

async function buildSectionContext(
  section: OutlineSection,
  context: ProjectContext,
  understanding: ProjectUnderstanding,
  insights: InsightsResult
): Promise<Record<string, unknown>> {
  const baseContext = {
    project: {
      name: context.name,
      projectType: context.projectType,
      language: context.language,
      packageManager: context.packageManager,
      license: context.license,
      framework: context.framework,
      entryPoints: context.entryPoints,
      scripts: context.scripts,
      routeEndpoints: context.routeEndpoints,
      configurationFiles: context.configurationFiles,
      hotFiles: context.hotFiles
    },
    understanding,
    insights
  };

  switch (section.id) {
    case "overview":
    case "features":
      return {
        ...baseContext,
        coreModules: context.coreModules,
        entrySourceSnippets: await loadSourceSnippets(context, context.entryPoints, 3, 120),
        hotFileSnippets: await loadSourceSnippets(context, context.hotFiles, 3, 120)
      };
    case "quickstart":
      return {
        ...baseContext,
        scripts: context.scripts,
        entryPoints: context.entryPoints,
        binCommands: await collectBinCommands(context),
        configExamples: await loadSourceSnippets(context, context.configurationFiles, 3, 120)
      };
    case "usage":
      return {
        ...baseContext,
        scripts: context.scripts,
        binCommands: await collectBinCommands(context),
        entrySourceSnippets: await loadSourceSnippets(context, context.entryPoints, 3, 120),
        coreModules: context.coreModules.slice(0, 6)
      };
    case "structure":
      return {
        ...baseContext,
        directoryTree: renderDirectoryTree(context.structure),
        coreModules: summarizeModuleExports(context.coreModules)
      };
    case "tech-stack":
      return {
        ...baseContext,
        dependencies: context.dependencies,
        devDependencies: context.devDependencies,
        coreModules: context.coreModules.slice(0, 8)
      };
    case "configuration":
      return {
        ...baseContext,
        configurationFiles: context.configurationFiles,
        configExamples: await loadSourceSnippets(context, context.configurationFiles, 4, 120)
      };
    case "api":
      return {
        ...baseContext,
        routeEndpoints: context.routeEndpoints,
        relatedModules: context.coreModules.filter((module) => module.routeHints.length > 0)
      };
    case "contributing":
      return {
        ...baseContext,
        scripts: context.scripts,
        contributors: context.contributors,
        lastCommit: context.lastCommit
      };
    default:
      return baseContext;
  }
}

function buildSectionRequirements(section: OutlineSection, context: ProjectContext): string[] {
  const requirements: Record<string, string[]> = {
    overview: [
      "以 `## 项目简介` 开头。",
      "第一段先用一句话说清楚项目是什么，长度控制在 GitHub 项目描述级别，不要写成宣传语。",
      "后面补 2-3 段：为什么需要它、它具体怎么解决问题、它和直接让 AI 一次性写 README 的区别或优势。",
      "至少引用一个真实机制、模块、命令或流程细节来支撑判断。"
    ],
    features: [
      "以 `## 功能特性` 开头。",
      "输出 4-6 条特性。",
      "每条都必须带具体事实，例如脚本名、扫描深度、重试机制、模块名、配置能力、文件名或接口数。",
      "不要写泛泛的'高质量''强大''灵活'，除非后面立刻解释为什么。"
    ],
    quickstart: [
      "以 `## 快速开始` 开头。",
      "只写真实可运行的命令，必须优先使用项目实际存在的 package scripts、bin 名称和入口命令。",
      "禁止出现占位符仓库地址或示例项目名，例如 `your-org`、`your-username`、`example-repo`、`your-project`。",
      "只有在上下文里能明确确认远程仓库地址时，才可以写 `git clone`；如果无法确认远程仓库地址，就不要写 `git clone`，改写为基于当前本地源码目录的安装或运行方式。",
      "说明最低运行环境、安装步骤、构建/开发/检查命令，以及一个最短可跑通的使用命令。",
      "如果项目缺失发布或安装信息，明确写出当前仓库内能确认的运行方式。"
    ],
    usage: [
      "以 `## 使用示例` 开头。",
      "围绕最核心的工作流给出真实输入输出示例，而不是罗列参数说明。",
      "至少包含一个命令或代码块，示例中的命令必须和当前项目脚本、bin、入口逻辑一致。",
      "如果无法确认完整输出，给出基于代码可确认的输入和结果范围。"
    ],
    api: [
      "以 `## API 文档` 开头。",
      "按已扫描到的端点分类总结，不要发明请求体、响应体或鉴权方式。",
      "如果信息不足，直接标注'当前扫描仅能确认以下路由/入口'。"
    ],
    configuration: [
      "以 `## 配置说明` 开头。",
      "基于真实配置文件或环境变量使用痕迹来写，不要编造默认值或密钥名。",
      "解释配置影响的是哪段流程，例如模型选择、输出路径、语言或 API 提供商。"
    ],
    structure: [
      "以 `## 项目结构` 开头。",
      "不要只贴目录树；先给一个简短的数据流说明，再解释关键目录和模块如何串起来。",
      "明确指出至少 3 个核心模块及其调用关系或职责边界。"
    ],
    "tech-stack": [
      "以 `## 技术栈` 开头。",
      "基于完整依赖列表归纳运行时依赖、开发工具和这些技术各自承担的职责。",
      "不要只点名框架，要写出它们在当前项目里的用途。"
    ],
    contributing: [
      "以 `## 贡献指南` 开头。",
      "结合真实 scripts 给出开发、检查、构建建议。",
      "如果仓库没有测试命令，不要假装有，直接说明当前只有哪些质量门槛。"
    ],
    license: [
      "以 `## 许可证` 开头。",
      `明确许可证为 ${context.license}。`
    ]
  };

  return requirements[section.id] ?? [`以 \`## ${section.title}\` 开头。`];
}

async function collectBinCommands(context: ProjectContext): Promise<string[]> {
  const packageJsonRaw = await safeReadFile(path.join(context.rootDir, "package.json"));
  if (!packageJsonRaw) {
    return [];
  }

  try {
    const packageJson = JSON.parse(packageJsonRaw) as { bin?: string | Record<string, string> };
    if (typeof packageJson.bin === "string") {
      return [context.name];
    }

    return Object.keys(packageJson.bin ?? {});
  } catch {
    return [];
  }
}

async function loadSourceSnippets(
  context: ProjectContext,
  files: string[],
  maxFiles: number,
  maxLines: number
): Promise<Array<{ file: string; snippet: string }>> {
  const snippets: Array<{ file: string; snippet: string }> = [];

  for (const file of Array.from(new Set(files)).slice(0, maxFiles)) {
    const absolutePath = path.join(context.rootDir, file);
    const content = await safeReadFile(absolutePath);
    if (!content) {
      continue;
    }

    snippets.push({
      file,
      snippet: content.split("\n").slice(0, maxLines).join("\n")
    });
  }

  return snippets;
}

function summarizeModuleExports(modules: ModuleInfo[]): Array<{
  file: string;
  summary: string;
  exports: string[];
  routeHints: string[];
}> {
  return modules.slice(0, 10).map((module) => ({
    file: module.file,
    summary: module.summary,
    exports: module.exports.slice(0, 8).map((item) => item.signature),
    routeHints: module.routeHints
  }));
}

function renderDirectoryTree(root: TreeNode): string {
  const lines: string[] = [];

  function visit(node: TreeNode, depth: number): void {
    const indent = "  ".repeat(depth);
    lines.push(`${indent}${node.type === "directory" ? "- " : "* "}${node.path}`);
    if (!node.children || depth >= 3) {
      return;
    }

    for (const child of node.children) {
      visit(child, depth + 1);
    }
  }

  visit(root, 0);
  return lines.join("\n");
}
