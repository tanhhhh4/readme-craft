import inquirer from "inquirer";
import type { OutlineSection, PlannedOutline, ProjectContext, ProjectUnderstanding } from "../types/index.js";

export async function planReadmeOutline(
  context: ProjectContext,
  understanding: ProjectUnderstanding,
  skipPrompt = false
): Promise<PlannedOutline> {
  const sections = buildSections(context, understanding);
  const enabledIds = sections.filter((section) => section.enabled).map((section) => section.id);

  if (skipPrompt) {
    return {
      template: context.projectType,
      sections
    };
  }

  const answers = await inquirer.prompt<{
    selectedSections: string[];
  }>([
    {
      type: "checkbox",
      name: "selectedSections",
      message: "建议的 README 结构，按空格切换后回车确认：",
      choices: sections.map((section) => ({
        name: `${section.title}${section.reason ? ` (${section.reason})` : ""}`,
        value: section.id,
        checked: section.enabled
      })),
      default: enabledIds,
      pageSize: 12
    }
  ]);

  return {
    template: context.projectType,
    sections: sections.map((section) => ({
      ...section,
      enabled: answers.selectedSections.includes(section.id)
    }))
  };
}

function buildSections(
  context: ProjectContext,
  understanding: ProjectUnderstanding
): OutlineSection[] {
  const common: OutlineSection[] = [
    { id: "overview", title: "项目简介", description: "一句话定位和详细背景", enabled: true },
    { id: "features", title: "功能特性", description: "核心能力列表", enabled: true },
    { id: "quickstart", title: "快速开始", description: "安装与运行步骤", enabled: true },
    { id: "usage", title: "使用示例", description: "关键工作流与命令示例", enabled: true },
    { id: "structure", title: "项目结构", description: "目录与核心模块说明", enabled: true },
    { id: "tech-stack", title: "技术栈", description: "主要依赖与技术亮点", enabled: true },
    { id: "contributing", title: "贡献指南", description: "开发与提交流程", enabled: true },
    { id: "license", title: "许可证", description: "授权信息", enabled: true }
  ];

  if (context.projectType === "api-service" || context.routeEndpoints.length > 0) {
    common.splice(4, 0, {
      id: "api",
      title: "API 文档",
      description: "路由与接口摘要",
      enabled: true,
      reason: `检测到 ${context.routeEndpoints.length} 个端点`
    });
  }

  if (context.configurationFiles.length > 0) {
    common.splice(common.length - 3, 0, {
      id: "configuration",
      title: "配置说明",
      description: "环境变量和配置文件",
      enabled: true,
      reason: `检测到 ${context.configurationFiles.length} 个配置文件`
    });
  }

  if (understanding.keyFeatures.length < 2) {
    const features = common.find((section) => section.id === "features");
    if (features) {
      features.reason = "功能特征较少，建议精简";
    }
  }

  return common;
}
