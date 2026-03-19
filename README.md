<h1 align="center">readme-craft</h1>
<p align="center">基于 LLM 的 CLI 工具，自动分析代码仓库并生成高质量 README 文档。</p>
<p align="center"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="Node Version" src="https://img.shields.io/badge/node-%3E%3D18.17.0-339933.svg" />
  <img alt="TypeScript" src="https://img.shields.io/badge/language-TypeScript-3178C6.svg" /></p>
<p align="center">
  <a href="#项目简介">项目简介</a> •
  <a href="#功能特性">功能特性</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#使用示例">使用示例</a> •
  <a href="#项目结构">项目结构</a> •
  <a href="#配置说明">配置说明</a> •
  <a href="#技术栈">技术栈</a> •
  <a href="#贡献指南">贡献指南</a> •
  <a href="#许可证">许可证</a>
</p>

---

## 项目简介

readme-craft 是一个基于 LLM 的 CLI 工具，通过五阶段管道从项目源码生成结构化 README，支持全量生成和基于快照差异的增量更新。

把项目信息一股脑丢给 AI 让它一次性写 README，常见结果是：内容空泛、占位符残留（`your-org`、`TBD`）、和实际代码脱节。根本原因是单次调用的上下文太浅——模型既要理解项目又要组织文档，两件事挤在一个 prompt 里，哪件都做不好。

readme-craft 把这个过程拆成五个串行阶段，每阶段的类型化 JSON 输出喂给下一阶段，逐步加深理解：

1. `scanProject` 扫描目录结构、入口点、核心模块、热文件和配置文件，构建 `ProjectContext`
2. `buildProjectUnderstanding`（temperature 0.1）读取实际入口源码，提取七维结构化理解，经 `normalizeUnderstanding` 校验修正
3. `buildProjectInsights`（temperature 0.15）从 entryPoints / hotFiles / coreModules / configurationFiles 四个来源去重后取前 8 个文件、截取前 80 行作为代码证据
4. `planReadmeOutline` 根据项目特征动态组装章节（`routeEndpoints` 非空时追加 API 章节，`configurationFiles` 存在时追加配置章节），支持 inquirer checkbox 交互选择或 `-y` 跳过
5. `generateReadmeSections` 逐节生成内容，每节经 `reviewSectionQuality` 双轨审查后决定是否重写

和一次性生成的核心区别在质量门控机制。`src/reviewer/index.ts` 中，每个章节生成后先走 `runRuleChecks`——6 项确定性布尔检查（安装步骤存在性、命令可运行性、代码示例、链接格式、徽章语法、占位符拦截，其中占位符通过 `/\[TODO\]|\bTBD\b|your-org|your-username|example-repo/i` 正则匹配），再走 `runAIReview` 四维评分（clarity / completeness / accuracy / actionability）。综合分按 `overallScore = AI均分 × 0.8 + 规则通过率 × 10 × 0.2` 加权。不达标时，上一轮的 `quality.issues` 以中文反馈注入下轮 prompt 自动重写，最多重试 `maxRegenerationAttempts` 轮——这是闭环改进，不是简单重试。

`sections/index.ts` 中的 `buildSectionRequirements` 为 10 种章节类型各自硬编码了中文写作规范（quickstart 禁止占位符仓库地址、structure 要求目录树放 `<details>` 折叠块、contributing 不假装存在测试命令），将质量要求前置到 prompt 构造阶段而非仅依赖后置审查。

<details>
<summary>关于增量更新</summary>

`readme-craft update` 不会全量重新生成。它通过 `buildSnapshot` / `readSnapshot` 生成项目快照，`detectChangedSections`（`src/cli/update.ts`）比对前后差异并映射到章节 ID，只对变更章节重新走生成+审查流程，再由 `mergeReadmeSections` 合并回现有文档。首次 `readme-craft init`，后续只需 `readme-craft update`。

</details>

<details>
<summary>当前已知限制</summary>

- 仅支持 Node.js / TypeScript 项目扫描（`src/scanner/node.ts`），尚无 Python、Go 等语言的 scanner 实现
- Mermaid 图表校验（`isValidMermaid`）要求首行必须为 `flowchart TD`、至少 2 个节点和 1 个 subgraph，不支持其他图表类型
- `collectInsightEvidence` 每个文件只截取前 80 行，深层逻辑可能被截断
- AI 提供商仅支持 Anthropic Claude 和 OpenAI，`max_tokens` 固定 4096

</details>

---

## 功能特性

1. **五阶段流水线，不是一次性丢给模型。** `readme-craft init` 串行执行 `scanProject` → `buildProjectUnderstanding`（temperature 0.1，输出 `ProjectUnderstanding` JSON） → `buildProjectInsights`（temperature 0.15，从 entryPoints/hotFiles/coreModules/configurationFiles 四源去重取前 8 个文件、截取前 80 行作为证据） → `planReadmeOutline`（inquirer checkbox 交互选择章节，`-y` 跳过） → `generateReadmeSections`（逐节生成 + 质量审查循环）。每阶段输出类型化 JSON（`ProjectContext → ProjectUnderstanding → InsightsResult → PlannedOutline → GeneratedSection[]`），层间通过 `normalizeUnderstanding` / `normalizeInsights` / `parseJson` 容错校验，任意阶段可独立调试。

2. **双轨质量门控 + 闭环重写。** 每个章节生成后经 `reviewSectionQuality`（`src/reviewer/index.ts`）两层检查：`runRuleChecks` 执行 6 项确定性布尔规则（安装步骤存在性、命令可运行性、代码示例、链接格式、徽章正确性、占位符拦截——正则 `/\[TODO\]|\bTBD\b|your-org|your-username|example-repo/i`），`runAIReview` 进行 clarity/completeness/accuracy/actionability 四维 1-10 评分。综合分公式：`overallScore = AI均分 × 0.8 + 规则通过率 × 10 × 0.2`。不达标时将 `quality.issues` 拼接为 `regenerationHint` 注入下轮 prompt（`上一次草稿的问题：...请修正这些问题后重写`），最多重试 `maxRegenerationAttempts` 轮。

3. **增量更新，只重写变更章节。** `readme-craft update` 通过 `buildSnapshot` / `readSnapshot`（`src/utils/snapshot.ts`）生成项目快照，`detectChangedSections`（`src/cli/update.ts`）比对前后差异映射到章节 ID，仅对变更章节重走生成+审查流程，由 `mergeReadmeSections` 合并回现有 Markdown。未变更章节原文保留，省掉全量重生成的 token 开销。

4. **10 种章节各有独立 prompt 工程。** `buildSectionPrompt`（`src/generator/sections/index.ts`）按章节类型注入差异化上下文：quickstart/usage 注入 `collectBinCommands` 提取的 bin 命令和 `cliHelpOutput`，structure 注入 `renderDirectoryTree` 和 `summarizeModuleExports`，api 注入 `routeEndpoints`。`buildSectionRequirements` 为每种章节硬编码 2-7 条中文约束规则（quickstart 禁止占位符仓库地址、structure 要求目录树放 `<details>` 折叠块、contributing 不假装存在测试命令）。

   <details>
   <summary>全部章节 ID 及条件启用逻辑</summary>

   基础 8 章节始终包含：`overview` · `features` · `quickstart` · `usage` · `structure` · `tech-stack` · `contributing` · `license`

   条件章节：当 `context.routeEndpoints` 非空时追加 `api`，当 `context.configurationFiles` 存在时追加 `configuration`。每个条件章节附带 `reason` 字段解释推荐原因。
   </details>

5. **Mermaid 架构图自动生成与校验。** `generateMermaidDiagram`（`src/generator/mermaid.ts`）调用 LLM（temperature 0.2）生成 `flowchart TD` 图表，要求按逻辑层分 subgraph、最多 15 节点、使用真实模块名。输出经 `sanitizeMermaid` 正则剥离 markdown fence，再由 `isValidMermaid` 校验：首行必须为 `flowchart TD`、至少 2 个节点 ID、至少 1 个 subgraph，`isMermaidKeyword` 过滤 `flowchart/subgraph/end/style/click` 等保留字避免误判节点数。校验不通过直接抛错。

6. **双 LLM 后端，分级 temperature。** 通过 `createAIProvider` 统一 `AIProvider` 接口（`complete` 方法），支持 Anthropic Claude 和 OpenAI。`AnthropicProvider`（`src/ai/anthropic.ts`）将 system 消息从 messages 数组分离以适配 API，`max_tokens` 固定 4096。三阶段 temperature 递增：comprehension 0.1、insights 0.15、mermaid 0.2。提供商、模型名、API 端点可通过 `.readme-craft.yml` 或 CLI `-m` / `-c` 覆盖，API Key 通过 `dotenv/config` 从 `.env` 加载。

---

## 快速开始

需要 Node.js ≥ 18，npm ≥ 8。至少配置一个 LLM API Key（Anthropic 或 OpenAI）。

```bash
# 1. 安装依赖并构建
npm install && npm run build

# 2. 配置 API Key（二选一）
cp .env.example .env
# 编辑 .env，填入 ANTHROPIC_API_KEY 或 OPENAI_API_KEY

# 3. 对当前项目生成 README
node dist/cli/index.js init
```

`init` 会依次执行扫描 → 理解 → 洞察 → 规划 → 生成五层管道，中途弹出 inquirer checkbox 让你勾选要生成的章节。加 `-y` 跳过交互直接使用默认章节组合。生成结果同时备份到 `.readme-craft/` 目录，供后续 `update` 命令做差量更新。

对其他目录的项目生成：

```bash
node dist/cli/index.js init /path/to/target-project
```

常用选项：`-m` 覆盖模型、`-l en` 切换英文输出、`-o custom-readme.md` 指定输出路径。

以下为实际 CLI 输出：

```
Usage: readme-craft [options] [command]

Generate high-quality README files with progressive project understanding

Options:
  -V, --version              output the version number
  -h, --help                 display help for command

Commands:
  init [options] [target]
  update [options] [target]
  help [command]             display help for command
```

<details>
<summary>其他安装方式</summary>

如果 `package.json` 中已配置 bin 字段，可以 link 到全局后直接使用命令名：

```bash
npm link
readme-craft init
```

开发阶段不想每次 build，可以用 `tsx` 直接跑源码：

```bash
npm run dev -- init /path/to/target-project
```

`npm run dev` 等价于 `tsx src/cli/index.ts`，后面的参数通过 `--` 透传给 commander。

</details>

<details>
<summary>.env 配置说明</summary>

`.env.example` 中列出了两个 key，只需填一个：

```env
# 使用 Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...

# 或使用 OpenAI
OPENAI_API_KEY=sk-...
```

工具通过 `dotenv/config` 自动加载项目根目录的 `.env`。也可以直接设环境变量，不依赖 `.env` 文件。

如果两个 key 都配了，`createAIProvider` 会根据 `-m` 指定的模型名前缀决定使用哪个后端。

</details>

---

## 使用示例

### 为当前项目生成 README

```bash
readme-craft init
```

默认分析当前目录，语言为中文（`-l zh`），输出到 `README.md`。执行后工具会依次完成项目扫描、LLM 理解、章节规划（交互式 checkbox 让你勾选要生成的章节）、逐章节生成与质量审查，最终写入文件并备份到 `.readme-craft/` 目录。

### 指定目标目录和模型

```bash
readme-craft init ./my-project -m claude-sonnet-4-20250514 -l en -o docs/README.md -y
```

`-y` 跳过章节选择和写入确认，直接按默认 8 章节全量生成。`-o` 控制输出路径。

### 更新已有 README

```bash
readme-craft update -y
```

`update` 基于 `.readme-craft/` 目录中上次 `init` 的备份做差量更新，而不是从头重新生成。

### 开发模式运行（未构建时）

```bash
npm run dev -- init ./target-project -y
```

等价于 `tsx src/cli/index.ts init ./target-project -y`，跳过 `tsc` 编译直接执行源码。

<details>
<summary>以下为实际 CLI 输出</summary>

```
Usage: readme-craft [options] [command]

Generate high-quality README files with progressive project understanding

Options:
  -V, --version              output the version number
  -h, --help                 display help for command

Commands:
  init [options] [target]
  update [options] [target]
  help [command]             display help for command
```

</details>

### 生成结果范围

基于代码可确认的输出内容：

- 最终产物是一个 Markdown 文件，包含你勾选的章节（基础 8 章节：overview / features / quickstart / usage / structure / tech-stack / contributing / license，如果项目有 `routeEndpoints` 会追加 api 章节，有 `configurationFiles` 会追加 configuration 章节）
- 每个章节经过 `reviewSectionQuality` 双轨审查（6 项确定性规则 + LLM 四维评分），不达标会自动重试并将问题注入下轮 prompt，重试上限由配置的 `maxRegenerationAttempts` 控制
- 包含一张 Mermaid `flowchart TD` 架构图，按逻辑层分 subgraph，最多 15 个节点，使用项目真实模块名
- `.readme-craft/` 目录下会保存本次输出的备份，供后续 `update` 使用

### 环境变量

工具通过 `dotenv/config` 自动加载 `.env`。必须配置 LLM 提供商的 API Key（参考 `.env.example`），支持 Anthropic Claude 和 OpenAI 两种后端，通过 `createAIProvider` 统一调度。

---

## 项目结构

readme-craft 采用五层管道架构，数据沿单向链路流动：

```
scanProject → buildProjectUnderstanding → buildProjectInsights → planReadmeOutline → generateReadmeSections
     ↓                ↓                          ↓                      ↓                     ↓
ProjectContext   ProjectUnderstanding       InsightsResult        PlannedOutline       GeneratedSection[]
```

每层输出类型化 JSON，层间通过 `normalizeUnderstanding`、`normalizeInsights`、`parseJson` 等函数校验和容错修正 LLM 原始输出。`reviewer` 模块不在主链路上，而是被 `generator` 在每个章节生成后调用，形成重试-反馈闭环。`mermaid` 模块同样由 `generator` 阶段触发，独立调用 LLM 生成架构图。

### 核心模块与调用关系

`src/comprehension/index.ts` — 管道第一层。通过 `loadEntrySources` 读取实际入口文件源码，构造 prompt 后以 `temperature: 0.1` 调用 LLM，输出 `ProjectUnderstanding` JSON。这是后续所有层的基础输入，insights 和 generator 都依赖它提供的 `oneLiner`、`architecture`、`keyFeatures` 等字段。

`src/generator/sections/index.ts` — 章节级 prompt 工厂。`buildSectionContext` 按章节类型注入差异化上下文（quickstart 注入 `collectBinCommands` 提取的 bin 命令和 `cliHelpOutput`，structure 注入 `renderDirectoryTree` 和 `summarizeModuleExports`）。`buildSectionRequirements` 为 10 种章节类型各定义 2-7 条中文生成规则，控制标题格式、折叠块使用、占位符禁止等。这个模块被 `src/generator/index.ts` 的 `generateSingleSection` 调用，是生成质量的前置保障。

`src/reviewer/index.ts` + `src/reviewer/rules.ts` — 双轨质量审查。`runRuleChecks` 执行 6 项确定性布尔检查（`hasInstallSteps`、`installStepsRunnable`、`hasCodeExamples`、`linksValid`、`badgesCorrect`、`noPlaceholders`），其中 `noPlaceholders` 使用正则 `/\[TODO\]|\bTBD\b|lorem ipsum|your-org|your-username/i` 拦截常见占位符。`runAIReview` 通过 LLM 进行 clarity/completeness/accuracy/actionability 四维 1-10 评分。最终分数公式：

```
overallScore = average(四维评分) * 0.8 + (6项规则通过率) * 10 * 0.2
```

不达标时 `generator` 将 `quality.issues` 拼接为 `regenerationHint` 注入下轮 prompt，最多重试 `maxRegenerationAttempts` 次。

### 其他关键目录

- `src/scanner/` — 项目静态扫描。`index.ts` 产出 `ProjectContext`，`cli-output.ts` 的 `captureCliHelp` 用正则剥离 ANSI 控制字符（代码中有 `eslint-disable-next-line no-control-regex` 标注）。
- `src/insights/` — 管道第二层。`collectInsightEvidence` 从 entryPoints/hotFiles/coreModules/configurationFiles 四个来源 `Set` 去重后取前 8 个文件，截取前 80 行作为 LLM 推理证据，`temperature: 0.15`。
- `src/planner/` — 管道第三层。`buildSections` 始终包含 8 个基础章节，当 `context.routeEndpoints` 非空时追加 api 章节，当 `context.configurationFiles` 存在时追加 configuration 章节，各附 `reason` 字段。支持 inquirer checkbox 交互勾选或 `-y` 跳过。
- `src/ai/` — LLM 适配层。`provider.ts` 定义 `AIProvider` 接口（`complete` 方法），`anthropic.ts` 和 `openai.ts` 分别实现 Claude 和 OpenAI 后端，通过 `createAIProvider` 统一创建。
- `src/cli/` — 基于 commander 注册 `init`/`update` 双命令。`init` 串联完整五层管道，末尾通过 `saveLastOutput` 备份到 `.readme-craft/` 目录，为 `update` 提供差量更新基线。

<details>
<summary>完整目录结构</summary>

```
.
├── .env.example              # 环境变量模板（LLM API key 等）
├── .readme-craft/            # 运行时输出备份
│   ├── last-output.txt       # 上次生成的 README 全文
│   └── snapshot.json         # 项目快照，供 update 差量比对
├── .readme-craft.yml         # 项目级配置（模型、语言、输出路径等）
├── package.json
├── tsconfig.json
└── src/
    ├── ai/
    │   ├── provider.ts       # AIProvider 接口定义
    │   ├── anthropic.ts      # Claude 实现
    │   ├── openai.ts         # OpenAI 实现
    │   └── index.ts          # createAIProvider 工厂
    ├── cli/
    │   ├── index.ts          # commander 程序入口，注册 init/update
    │   ├── init.ts           # init 命令：串联五层管道
    │   └── update.ts         # update 命令：基于 snapshot 差量更新
    ├── comprehension/
    │   ├── index.ts          # buildProjectUnderstanding（temperature 0.1）
    │   └── prompts.ts        # initialUnderstandingPrompt 模板
    ├── insights/
    │   └── index.ts          # buildProjectInsights + collectInsightEvidence
    ├── planner/
    │   └── index.ts          # planReadmeOutline + buildSections 动态章节组装
    ├── generator/
    │   ├── index.ts          # generateReadmeSections + 重试反馈循环
    │   ├── mermaid.ts        # generateMermaidDiagram + sanitize/validate
    │   └── sections/
    │       └── index.ts      # 10 种章节的 context 注入 + requirements 规则
    ├── reviewer/
    │   ├── index.ts          # reviewSectionQuality 双轨评分 + overallScore
    │   ├── rules.ts          # 6 项确定性布尔规则检查
    │   └── ai-review.ts      # LLM 四维评分
    ├── scanner/
    │   ├── index.ts          # scanProject → ProjectContext
    │   ├── node.ts           # Node.js 项目特化扫描逻辑
    │   └── cli-output.ts     # captureCliHelp + ANSI 剥离
    ├── types/
    │   └── index.ts          # 全部类型定义（ProjectContext 等）
    └── utils/
        ├── config.ts         # loadConfig 读取 .readme-craft.yml
        ├── fs.ts             # 文件系统工具
        ├── json.ts           # parseJson 容错解析
        ├── log.ts            # 日志工具
        ├── markdown.ts       # renderReadme + renderDirectoryTree
        ├── project-type.ts   # 项目类型推断
        └── snapshot.ts       # saveLastOutput + snapshot 管理
```

</details>

---

## 配置说明

readme-craft 的配置分两层：环境变量（`.env`）控制 LLM 后端认证，CLI 参数控制单次运行行为。项目通过 `dotenv/config` 在启动时自动加载工作目录下的 `.env` 文件。

### 环境变量

项目根目录提供了 `.env.example` 作为模板：

```dotenv
# 使用 OpenAI 时需要
OPENAI_API_KEY=

# 使用 Anthropic 时需要
ANTHROPIC_API_KEY=
```

两个 key 只需配一个。`createAIProvider` 根据你提供的 key 决定调用哪个后端。如果两个都设了，具体优先级取决于 `createAIProvider` 的实现逻辑（建议只保留你要用的那个，避免歧义）。

这两个变量影响的是整条管道中所有 LLM 调用——comprehension（temperature 0.1）、insights（temperature 0.15）、generator、reviewer 的 AI 评分、mermaid 图表生成，全部走同一个 provider。

### CLI 参数

基于 commander 注册的 `init` 和 `update` 两个命令，支持以下选项：

| 参数 | 作用 | 影响的流程 |
|------|------|-----------|
| `-c <path>` | 指定配置文件路径 | 项目扫描阶段的输入源 |
| `-m <model>` | 覆盖默认模型 | 所有 LLM 调用使用的模型标识 |
| `-l <lang>` | 输出语言，默认 `zh` | sections/index.ts 中章节生成规则和 prompt 的语言切换 |
| `-o <path>` | 输出文件路径 | renderReadme 写入的目标文件 |
| `-y` | 跳过确认，不弹出 inquirer checkbox | planner 层直接使用 buildSections 的默认章节组合 |

示例：

```bash
# 用 Anthropic 后端，中文输出，跳过交互确认
ANTHROPIC_API_KEY=sk-xxx npx readme-craft init -l zh -y

# 指定模型和输出路径
npx readme-craft init -m claude-sonnet-4-20250514 -o docs/README.md
```

### 生成产物与备份

`init` 完成后会调用 `saveLastOutput` 将本次生成结果备份到 `.readme-craft/` 目录。`update` 命令依赖这个备份作为差量更新的基线。如果你删了 `.readme-craft/`，`update` 将无法正常工作。

建议在 `.gitignore` 中保留 `.readme-craft/`（项目已默认忽略），但不要手动删除它。

<details>
<summary>tsconfig.json 编译配置</summary>

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src/**/*.ts"]
}
```

开启了 `noUncheckedIndexedAccess` 和 `exactOptionalPropertyTypes`，这意味着如果你要改源码，数组/对象索引访问需要处理 `undefined`，可选属性不能赋值 `undefined`（除非类型显式包含）。编译产物输出到 `dist/`，CLI 入口为 `dist/cli/index.js`。

</details>

### 不在配置范围内的东西

以下行为是硬编码的，不能通过配置修改：

- 各层 temperature 值（comprehension 0.1、insights 0.15）
- `collectInsightEvidence` 取前 8 个文件、每文件截取前 80 行
- mermaid 图表最多 15 节点的限制
- reviewer 的 `overallScore` 加权公式（AI 评分均值 × 0.8 + 规则通过率 × 10 × 0.2）
- `maxRegenerationAttempts` 的重试次数上限

如果需要调整这些参数，目前只能改源码。

---

## 技术栈

TypeScript 全栈，运行在 Node.js 上，编译目标由 `tsconfig.json` 控制，构建命令 `tsc -p tsconfig.json`，开发时用 `tsx` 直接执行 TS 源码（`npm run dev` → `tsx src/cli/index.ts`）。

运行时依赖分三类：

- LLM 通信：`@anthropic-ai/sdk` 和 `openai` 两个 SDK 并存，通过 `createAIProvider` 统一为 `AIProvider` 接口（只暴露 `complete` 方法），各管道层按需传入不同 `temperature`（comprehension 0.1、insights 0.15、mermaid 0.2）。切换后端只需改 `.env` 中的 provider 配置，不动业务代码。
- CLI 框架：`commander` 注册 `init` / `update` 两个子命令及其选项（`-c` 配置路径、`-m` 模型覆盖、`-l` 语言、`-o` 输出路径、`-y` 跳过确认）；`inquirer` 负责交互式 checkbox（章节勾选）和 confirm 提示（写入确认）。
- 工具库：`dotenv` 在 CLI 入口自动加载 `.env`；`js-yaml` 解析 YAML 格式的配置文件；`simple-git` 用于读取 Git 仓库信息（供 scanner 层构建项目上下文）。

开发工具链只有三样：`typescript` 编译器（`tsc --noEmit` 做类型检查）、`tsx` 免编译执行、`@types/node` 和 `@types/js-yaml` 提供类型定义。没有 bundler，没有测试框架，没有 linter 配置——当前质量门槛靠 `tsc --noEmit`（`npm run check`）守住。

<details>
<summary>依赖清单</summary>

| 包名 | 版本 | 类别 | 在项目中的职责 |
|---|---|---|---|
| `@anthropic-ai/sdk` | ^0.79.0 | 运行时 | Anthropic Claude API 调用，comprehension/insights/generator/mermaid 各层通过 AIProvider 接口使用 |
| `openai` | ^5.12.2 | 运行时 | OpenAI API 调用，与 Anthropic SDK 通过 createAIProvider 统一抽象 |
| `commander` | ^14.0.0 | 运行时 | CLI 命令注册与参数解析（init/update 子命令及 -c/-m/-l/-o/-y 选项） |
| `inquirer` | ^12.9.6 | 运行时 | 交互式 checkbox 选择章节、confirm 确认写入 |
| `dotenv` | ^17.3.1 | 运行时 | 自动加载 `.env` 文件中的 API 密钥和配置 |
| `js-yaml` | ^4.1.0 | 运行时 | 解析 YAML 格式的项目配置文件 |
| `simple-git` | ^3.28.0 | 运行时 | 读取 Git 仓库元信息供 scanner 层构建 ProjectContext |
| `typescript` | ^5.9.3 | 开发 | 编译 TS 源码（`npm run build`）和类型检查（`npm run check`） |
| `tsx` | ^4.20.5 | 开发 | 开发阶段免编译直接执行 TS（`npm run dev`） |
| `@types/node` | ^24.5.2 | 开发 | Node.js API 类型定义 |
| `@types/js-yaml` | ^4.0.9 | 开发 | js-yaml 类型定义 |

</details>

值得注意的取舍：项目没有引入 `langchain` 或类似的 LLM 编排框架，而是自己实现了五层管道和重试逻辑。好处是零额外抽象开销，每层的 prompt 构造、temperature 选择、输出校验都可以精确控制；代价是新增 LLM 后端需要手动实现 `AIProvider` 接口适配。

---

## 贡献指南

readme-craft 目前是单人维护项目，欢迎提交 Issue 和 PR。

质量底线：PR 必须通过 `npm run check`（TypeScript 类型检查），不能引入新的类型错误。项目当前没有测试框架和测试命令，唯一的自动化质量门槛就是 `tsc --noEmit`。

代码风格跟随现有模块的写法，不需要额外配置 linter。提交信息用中文或英文均可，说清楚改了什么就行。

<details>
<summary>开发流程细节</summary>

### 环境准备

```bash
git clone <your-fork-url>
cd readme-craft
npm install
cp .env.example .env
# 在 .env 中填入 Anthropic 或 OpenAI 的 API Key
```

### 可用的 npm scripts

| 命令 | 作用 |
|---|---|
| `npm run dev` | 通过 `tsx src/cli/index.ts` 直接运行 CLI，不需要先编译 |
| `npm run check` | `tsc --noEmit`，只做类型检查，不产出文件 |
| `npm run build` | `tsc -p tsconfig.json`，编译到 `dist/` |

开发时用 `npm run dev -- init` 或 `npm run dev -- update` 直接跑 CLI 命令，不需要反复 build。

### 项目结构与改动指引

改动前先确认你要动的是哪一层：

- `src/scanner/` — 项目扫描，产出 `ProjectContext`
- `src/comprehension/` — LLM 理解层，产出 `ProjectUnderstanding`
- `src/insights/` — 证据收集 + LLM 洞察，产出 `InsightsResult`
- `src/planner/` — 章节规划，产出 `PlannedOutline`
- `src/generator/` — 章节生成 + Mermaid 图表
- `src/reviewer/` — 双轨质量审查（规则检查 + LLM 评分）
- `src/cli/` — commander 命令注册（init / update）
- `src/types/index.ts` — 所有层间数据结构的类型定义

层间数据流是单向的：`ProjectContext → ProjectUnderstanding → InsightsResult → PlannedOutline → GeneratedSection[]`。如果你要改某一层的输出结构，先改 `src/types/index.ts` 里对应的类型，然后 `npm run check` 会告诉你哪些下游消费方需要同步更新。

### 章节生成规则

如果你想新增或修改某个章节的生成行为，改 `src/generator/sections/index.ts`。每个章节类型在 `buildSectionRequirements` 中有独立的中文规则集（2-7 条），在 `buildSectionContext` 中有独立的上下文注入逻辑。新增章节类型还需要在 `src/planner/` 的 `buildSections` 中注册，并设置触发条件和 `reason` 字段。

### Mermaid 模块

`src/generator/mermaid.ts` 有独立的校验链：`sanitizeMermaid`（剥离 markdown fence）→ `isValidMermaid`（首行声明 + ≥2 节点 + ≥1 subgraph）。改动后用实际项目跑一次 `npm run dev -- init` 确认生成的图表能在 GitHub 上渲染。

### reviewer 评分公式

`overallScore = 四维 LLM 评分均值 × 0.8 + 规则通过率 × 10 × 0.2`

6 项确定性规则在 `src/reviewer/rules.ts`，包括 `noPlaceholders` 的正则检测。如果你要加新规则，加在 `runRuleChecks` 里，权重会自动参与计算。

### 提交 PR 前

```bash
npm run check   # 必须通过，零错误
npm run build   # 确认能编译
```

没有自动化测试，所以请在 PR 描述中说明你用什么项目实际跑过 `init` 或 `update`，贴一下关键输出片段。

</details>

---

## 许可证

本项目基于 [MIT License](./LICENSE) 发布。

你可以自由使用、修改、分发本项目代码，包括用于商业用途，只需保留原始版权声明。

<details>
<summary>第三方依赖许可证说明</summary>

readme-craft 运行时依赖 `commander`、`inquirer`、`dotenv` 等 npm 包，各依赖遵循其自身许可证条款。运行以下命令可查看完整依赖许可证清单：

```bash
npx license-checker --summary
```

本项目调用 Anthropic Claude 和 OpenAI API 生成内容，生成产物的使用需同时遵守对应 API 提供商的服务条款。

</details>
