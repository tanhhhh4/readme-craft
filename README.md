<div align="center">

# 🛠️ readme-craft

**AI 驱动的 README 生成器，不是一次性丢给模型，而是五阶段流水线。**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

[快速开始](#-快速开始) · [功能特性](#-功能特性) · [工作原理](#-工作原理) · [配置](#-配置) · [贡献](#-贡献)

</div>

---

## 🤔 为什么不直接让 AI 写 README？

直接把代码丢给 AI 写 README，你会得到：
- `your-org/your-project` 占位符满天飞
- 泛泛的功能描述，跟实际代码对不上
- 安装命令是编的，跑不通

**readme-craft 的做法不同：** 把生成过程拆成 5 个阶段，每阶段输出喂给下一阶段，逐步加深理解。生成完还有双重质量审查，不达标自动重写。

---

## ⚡ 快速开始

```bash
# 安装依赖
npm install

# 配置 API Key
cp .env.example .env  # 填入 OPENAI_API_KEY 或 ANTHROPIC_API_KEY

# 构建
npm run build

# 对目标项目生成 README
readme-craft init ./your-project

# 后续代码变更后，增量更新（只重写变更章节）
readme-craft update ./your-project
```

> 默认使用 OpenAI `gpt-4o-mini`，也支持 Anthropic Claude。通过 `-m` 切换模型。

---

## ✨ 功能特性

| 特性 | 说明 |
|------|------|
| 🔄 **五阶段流水线** | 扫描 → 理解 → 洞察 → 规划 → 生成+审查，不是一次性生成 |
| 🔍 **深度项目扫描** | 自动检测入口点、框架、包管理器、Git 热点文件、路由端点、配置文件 |
| 🧠 **证据驱动** | 从源码中采集真实代码片段作为 AI 推理依据 |
| ✅ **双重质量审查** | 6 项规则检查 + AI 四维评分，不达标自动重写 |
| 📝 **交互式章节选择** | 动态推荐章节，支持交互选择或 `--yes` 跳过 |
| 📊 **Mermaid 架构图** | 自动生成模块依赖关系图 |
| 🔄 **增量更新** | `update` 命令只重写变更章节，省 token |
| 🤖 **双 AI 后端** | 支持 OpenAI 和 Anthropic，灵活切换 |

---

## 🏗️ 工作原理

```
┌─────────┐    ┌──────────────┐    ┌──────────┐    ┌─────────┐    ┌───────────────┐
│  Scan   │───▶│ Comprehend   │───▶│ Insights │───▶│  Plan   │───▶│ Generate +    │
│ Project │    │ (temp 0.1)   │    │(temp 0.15)│   │ Outline │    │ Review Loop   │
└─────────┘    └──────────────┘    └──────────┘    └─────────┘    └───────────────┘
                                                                         │
                                                                    ┌────▼────┐
                                                                    │ Quality │
                                                                    │  Gate   │
                                                                    │ ✓ Rules │
                                                                    │ ✓ AI    │
                                                                    └─────────┘
```

每个阶段输出类型化 JSON，层间有容错校验，任意阶段可独立调试。

<details>
<summary>📋 支持的章节类型（10 种）</summary>

`overview` · `features` · `quickstart` · `usage` · `api` · `configuration` · `structure` · `tech-stack` · `contributing` · `license`

其中 `api` 和 `configuration` 根据项目特征条件启用。

</details>

---

## ⚙️ 配置

创建 `.readme-craft.yml`：

```yaml
model:
  provider: anthropic          # 或 openai
  model: claude-sonnet-4-20250514
  baseUrl: https://api.anthropic.com
  apiKey: env:ANTHROPIC_API_KEY  # 从环境变量读取

language: zh                   # 输出语言
outputFile: README.md
```

CLI 选项：

```
-m, --model <model>      覆盖模型
-l, --language <lang>    输出语言（默认 zh）
-o, --output <path>      输出文件路径
-c, --config <path>      指定配置文件
-y, --yes                跳过交互，使用默认章节
```

配置优先级：CLI 选项 > `.readme-craft.yml` > 环境变量

---

## 📁 项目结构

<details>
<summary>展开查看</summary>

```
src/
├── cli/              # CLI 入口（init / update）
├── scanner/          # 项目扫描（目录结构、入口点、热文件）
├── comprehension/    # AI 项目理解（两轮精炼）
├── insights/         # 证据采集与洞察提取
├── planner/          # 章节规划
├── generator/        # 内容生成 + Mermaid 图
│   ├── sections/     # 10 种章节的 prompt 工程
│   └── mermaid.ts    # 架构图生成与校验
├── reviewer/         # 双重质量审查
│   ├── ai-review.ts  # AI 四维评分
│   └── rules.ts      # 确定性规则检查
├── ai/               # AI 提供商抽象层
│   ├── anthropic.ts
│   └── openai.ts
├── utils/            # 工具函数
└── types/            # TypeScript 类型定义
```

</details>

---

## 🤝 贡献

欢迎 PR 和 Issue！

```bash
git clone https://github.com/tanhhhh4/readme-craft.git
cd readme-craft
npm install
npm run build
```

---

## 📄 许可证

[MIT](LICENSE)
