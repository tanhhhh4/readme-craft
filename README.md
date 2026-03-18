# readme-craft

> 基于 AI 的 CLI 工具，通过五阶段渐进式流水线（扫描→理解→洞察→规划→生成+审查）从源码自动生成结构化、经过双重质量审查的 README 文档。

## 项目简介

readme-craft 是一个 CLI 工具，通过五阶段串行流水线从 Node.js/TypeScript 项目源码自动生成 README，每阶段的输出作为下一阶段的输入逐步深化对项目的理解。

直接把项目丢给 LLM 让它一次性写 README，常见的问题是：模型拿到的上下文要么太少（只有你贴进去的片段），要么太杂（整个仓库塞进 prompt），结果是空话多、细节错、和代码实际对不上。readme-craft 的做法是把"理解项目"和"写文档"拆成显式的阶段。`scanNodeProject`（`src/scanner/node.ts`）先对目标目录做静态分析，从 `package.json` 的 bin/main/module 字段推断入口点、通过 lock 文件嗅探包管理器、用 `simple-git` 提取提交历史热文件、收集核心模块导出和路由端点，输出一个 15+ 维度的 `ProjectContext`。然后 `buildProjectUnderstanding`（`src/comprehension/index.ts`）用两轮 LLM 调用——第一轮基于元数据，第二轮读取入口源码精炼——再通过 `normalizeUnderstanding` 与 `ProjectContext` 交叉校验，降低幻觉风险。`buildProjectInsights` 从入口点、热文件、核心模块中选取最多 8 个文件提取代码片段作为证据，确保后续生成的内容有代码支撑。

生成阶段同样不是一锤子买卖。`buildSectionRequirements`（`src/generator/sections/index.ts`）为 10 种章节类型定义了独立的写作约束——比如 features 要求 4-6 条且每条必须带具体事实，quickstart 只允许写项目中真实存在的脚本和命令。每个章节生成后立即经过双重审查：`runRuleChecks`（`src/reviewer/rules.ts`）执行 6 项确定性检查（安装步骤是否存在、命令是否可运行、是否含占位符等），`runAIReview` 从 clarity/completeness/accuracy/actionability 四个维度评分，两者按 `overallScore = AI均分×0.8 + 规则通过率×10×0.2` 加权合成。不达标时，上一轮的具体 issues 会作为 `regenerationHint` 注入 prompt 重试（默认最多 2 次），引导模型针对性修正而非盲目重写。

当前版本（0.1.0）仅支持 Node.js/TypeScript 项目扫描，通过 `readme-craft init [target]` 触发，支持 `--yes` 非交互模式、`.readme-craft.yml` 配置文件、OpenAI/Anthropic 双提供商切换。生成快照持久化在 `.readme-craft/` 目录，但增量更新尚未实现。

## 功能特性

- **五阶段串行流水线，不做一次性生成。** `runInitCommand`（`src/cli/init.ts`）严格按 scan → comprehension → insights → planner → generator+reviewer 顺序执行，每阶段的输出作为下一阶段的输入。comprehension 阶段对 LLM 发起两轮调用（第一轮基于 `ProjectContext` 元数据，第二轮读取入口源码精炼），并通过 `normalizeUnderstanding` 与项目事实交叉校验。这种串行设计牺牲速度，换取上下文逐级丰富，减少 LLM 凭空编造的概率。

- **Scanner 提取 15+ 维度项目上下文。** `scanNodeProject`（`src/scanner/node.ts`）一次扫描完成：`detectPackageManager` 通过 lock 文件嗅探包管理器、`detectEntryPoints` 从 bin/main/module 字段推断入口、`detectFrameworks` 按依赖名匹配框架、`collectRouteHints` 正则扫描路由端点、`collectGitSummary` 通过 simple-git 提取提交热文件、`collectCoreModules` 收集模块导出、`buildDirectoryTree` 构建最深 4 层的目录树（`maxDepth=4`）、`collectComments` 提取代码注释、`detectLicense` 识别许可证。扫描范围限于 `.ts/.tsx/.js/.jsx/.mjs/.cjs` 六种扩展名（`SOURCE_EXTENSIONS`），自动跳过 `node_modules`、`dist`、`.git` 等 8 个目录（`DEFAULT_IGNORE`）。

- **双重质量审查 + 自动重试。** 每个章节生成后立即经过 `reviewSectionQuality`（`src/reviewer/index.ts`）审查：`runRuleChecks`（`src/reviewer/rules.ts`）执行 6 项确定性检查——安装步骤存在性、命令可运行性、代码示例、链接格式、徽章正确性、占位符检测（正则匹配 `[TODO]`/`TBD`/`your-username` 等）；`runAIReview` 评估 clarity/completeness/accuracy/actionability 四个维度。综合评分公式：`overallScore = AI四维均分 × 0.8 + 规则通过率 × 10 × 0.2`。不达标时，上轮 `quality.issues` 拼接为 `regenerationHint` 注入下一轮 prompt，引导 LLM 针对性修正，默认最多重试 2 次（`maxRegenerationAttempts`）。

- **10 种章节类型各有独立写作规则和上下文注入。** `buildSectionPrompt`（`src/generator/sections/index.ts`）为 overview、features、quickstart、usage、api、configuration、structure、tech-stack、contributing、license 分别定义 `buildSectionRequirements` 规则（如 features 要求 4-6 条且必须带具体事实，quickstart 只允许写真实可运行命令）。`buildSectionContext` 按章节类型注入不同上下文：`collectBinCommands` 提取 bin 命令、`loadSourceSnippets` 加载源码片段、`summarizeModuleExports` 汇总模块导出、`renderDirectoryTree` 渲染目录树。

- **三层配置合并，支持双 LLM 提供商。** `loadConfig`（`src/utils/config.ts`）按优先级合并：`.readme-craft.yml`/`.yaml` 配置文件 → CLI 选项（`-c`/`-m`/`-l`/`-o`/`-y`）→ 环境变量回退（`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`）。`resolveApiKey` 支持 `env:VAR_NAME` 间接引用语法。通过 `createAIProvider` 工厂切换 OpenAI（默认 `gpt-4o-mini`）和 Anthropic，支持自定义 `baseUrl`。`--yes` 跳过所有交互确认，适合 CI/CD 环境。

- **LLM 输出的工程化容错。** `safeParseJson`（`src/utils/json.ts`）实现多层 JSON 修复链：`extractCodeBlockContent` 提取代码块 → `extractBalancedJsonObject` 平衡括号提取 → `normalizeQuoteCharacters` 修复智能引号 → `escapeInnerDoubleQuotes` 转义内嵌引号 → `stripTrailingCommas` 去尾逗号 → `repairJson` 综合修复。insights 阶段的 `collectInsightEvidence` 从入口点、Git 热文件、核心模块、配置文件中去重后取前 8 个文件（`slice(0, 8)`）作为证据输入，`normalizeInsights` 通过 `uniqueNonEmpty` 去重过滤。

## 快速开始

**环境要求**

- Node.js >= 18
- npm/yarn/pnpm

**安装**

```bash
npm install -g readme-craft
```

或从源码运行：

```bash
git clone https://github.com/your-org/readme-craft.git
cd readme-craft
npm install
npm run build
```

**基本用法**

在项目根目录执行：

```bash
readme-craft init
```

交互式选择章节后生成 README.md。

**非交互模式（CI/CD）**

```bash
readme-craft init --yes
```

自动选择所有推荐章节并生成。

**配置 AI 提供商**

创建 `.readme-craft.yml`：

```yaml
provider: openai  # 或 anthropic
model: gpt-4o-mini
apiKey: env:OPENAI_API_KEY
language: zh
```

或通过环境变量：

```bash
export OPENAI_API_KEY=sk-...
readme-craft init
```

**开发命令**

```bash
npm run dev      # 直接运行 TypeScript 源码（tsx）
npm run build    # 编译到 dist/cli/
npm run check    # 类型检查
```

**输出**

- `README.md` - 生成的文档
- `.readme-craft/` - 生成快照（ProjectContext、理解结果、洞察、大纲）

## 使用示例

readme-craft 当前只有一个子命令 `init`，完整工作流是：扫描目标项目 → 两轮 LLM 理解 → 证据提取 → 交互选章节 → 逐章节生成+审查 → 写入文件。

### 对当前目录生成中文 README（默认行为）

```bash
readme-craft init
```

`-l` 默认值是 `zh`，输出默认写入 `README.md`。命令执行后会依次经过五个阶段，在 planner 阶段弹出 inquirer checkbox 让你勾选要生成的章节（默认全选 8 个通用章节：项目简介、功能特性、快速开始、使用示例、项目结构、技术栈、贡献指南、许可证）。如果项目有路由端点或配置文件，还会动态追加 API 文档和配置说明章节。最后会提示 `Write README to /path/to/README.md?` 确认写入。

生成完成后，`.readme-craft/` 目录下会保存一份快照，包含 ProjectContext、ProjectUnderstanding、InsightsResult、PlannedOutline 及各章节内容的完整序列化。

### 指定目标目录和输出路径

```bash
readme-craft init ./my-project -o docs/README.md -l en
```

`[target]` 参数默认 `process.cwd()`，这里指向 `./my-project`。scanner 会从该目录读取 `package.json`、lock 文件、Git 历史等。`-o` 控制输出路径，相对于 target 目录解析。

### CI/CD 非交互模式

```bash
OPENAI_API_KEY=sk-xxx readme-craft init . --yes --model gpt-4o -o README.md
```

`--yes` 做两件事：跳过 planner 阶段的 inquirer 交互（全选所有推荐章节），跳过最终写入确认。适合在 CI 中跑。`--model` 覆盖配置文件中的模型名。API key 通过环境变量传入，也可以在 `.readme-craft.yml` 中用 `apiKey: env:OPENAI_API_KEY` 间接引用。

### 使用配置文件

```yaml
# .readme-craft.yml
provider: anthropic
model: claude-sonnet-4-20250514
apiKey: env:ANTHROPIC_API_KEY
language: zh
outputFile: README.md
maxRegenerationAttempts: 3
```

```bash
readme-craft init -c .readme-craft.yml
```

配置加载优先级：CLI 选项 > `.readme-craft.yml` > 环境变量回退。`maxRegenerationAttempts` 控制每个章节审查不达标时的最大重试次数（默认 2）。每次重试会把上轮 reviewer 发现的具体 issues 拼接为 `regenerationHint` 注入 prompt，而不是盲目重写。

### 开发调试（未构建时）

```bash
npx tsx src/cli/index.ts init ./target-project --yes
```

等价于 `npm run dev -- init ./target-project --yes`。跳过 `tsc` 编译直接用 tsx 执行 TypeScript 入口。

### 关于输出内容的预期

无法给出固定的输出示例——生成内容取决于目标项目的实际代码和 LLM 响应。可以确认的是：

- 输出是一个完整的 Markdown 文件，由 `renderReadme` 按用户选定的章节顺序拼装
- 每个章节都经过 reviewer 双重检查：6 项确定性规则（是否有安装步骤、代码示例是否存在、链接格式、徽章格式、是否残留占位符）+ 4 维度 AI 评分（clarity/completeness/accuracy/actionability）
- 质量分计算公式：`overallScore = AI四维均分 × 0.8 + 规则通过率 × 10 × 0.2`
- 不达标的章节会自动重试，重试时 prompt 中会包含上轮的具体问题列表

## 项目结构

整个工具围绕一条严格串行的五阶段流水线运转。`src/cli/init.ts` 中的 `runInitCommand` 是唯一的编排入口，按固定顺序调用各阶段模块，每一步的输出直接作为下一步的输入参数传递，没有并行或跳步：

```
scanProject(targetDir)          → ProjectContext
  ↓
buildProjectUnderstanding(...)  → ProjectUnderstanding
  ↓
buildProjectInsights(...)       → InsightsResult
  ↓
planReadmeOutline(...)          → PlannedOutline
  ↓
generateReadmeSections(...)     → GeneratedSection[]  （内部每章节循环调用 reviewer）
  ↓
renderReadme → saveSnapshot → 写入 README.md + .readme-craft/snapshot.json
```

```
src/
├── cli/                  # CLI 入口与命令编排
│   ├── index.ts          # commander v14 顶层 await 入口，注册 init 子命令
│   └── init.ts           # runInitCommand：五阶段流水线的串行调度器
├── scanner/              # 阶段 1：静态分析
│   ├── index.ts          # scanProject 入口，按项目类型分发
│   └── node.ts           # scanNodeProject：读取 package.json、嗅探 lock 文件检测包管理器、
│                         #   收集源文件（.ts/.tsx/.js/.jsx/.mjs/.cjs）、提取 Git 热文件、
│                         #   推断入口点、识别框架、扫描路由端点、收集核心模块导出
├── comprehension/        # 阶段 2：项目理解
│   ├── index.ts          # buildProjectUnderstanding：两轮 LLM 调用（元数据→入口源码精炼），
│   │                     #   temperature=0.1，normalizeUnderstanding 与 ProjectContext 交叉校验
│   └── prompts.ts        # initialUnderstandingPrompt / refineUnderstandingPrompt 模板
├── insights/             # 阶段 3：洞察提取
│   └── index.ts          # buildProjectInsights：collectInsightEvidence 从入口点+热文件+核心模块+
│                         #   配置文件去重后取前 8 个文件提取代码片段，temperature=0.15 调用 LLM
├── planner/              # 阶段 4：大纲规划
│   └── index.ts          # planReadmeOutline：buildSections 生成 8 个通用章节 + 按 routeEndpoints/
│                         #   configurationFiles 动态追加 api/configuration，inquirer checkbox 交互
├── generator/            # 阶段 5a：章节生成
│   ├── index.ts          # generateReadmeSections → generateSingleSection 循环，每轮生成后
│   │                     #   立即调用 reviewer，不达标则将 issues 拼为 regenerationHint 重试（默认最多 2 次）
│   └── sections/
│       └── index.ts      # buildSectionPrompt：为 10 种章节类型注入独立的写作要求和上下文
├── reviewer/             # 阶段 5b：质量审查（与 generator 紧耦合）
│   ├── index.ts          # reviewSectionQuality：合成 overallScore = AI四维均分×0.8 + 规则通过率×10×0.2
│   ├── rules.ts          # runRuleChecks：6 项确定性检查（安装步骤/可运行性/代码示例/链接格式/徽章/占位符）
│   └── ai-review.ts      # runAIReview：LLM 评估 clarity/completeness/accuracy/actionability
├── ai/                   # LLM 提供商抽象层
│   ├── provider.ts       # AIProvider 接口定义
│   ├── openai.ts         # OpenAI SDK 封装（默认 gpt-4o-mini）
│   ├── anthropic.ts      # Anthropic SDK 封装
│   └── index.ts          # createAIProvider 工厂，按 config.model.provider 字段切换
├── types/
│   └── index.ts          # ProjectContext / ProjectUnderstanding / InsightsResult / PlannedOutline /
│                         #   QualityCheck / GeneratedSection 等全部类型定义
└── utils/
    ├── config.ts         # loadConfig：.readme-craft.yml → CLI 选项 → 环境变量三层合并，
    │                     #   resolveApiKey 支持 env:VAR_NAME 间接引用
    ├── json.ts           # safeParseJson：6 层容错链（代码块提取→平衡括号→智能引号修复→
    │                     #   尾逗号清理→repairJson），处理 LLM 输出的非标准 JSON
    ├── fs.ts             # listFiles / readJsonFile / saveSnapshot 等文件操作
    ├── markdown.ts       # renderReadme：将 GeneratedSection[] 组装为最终 Markdown
    ├── log.ts            # 日志工具
    └── project-type.ts   # 项目类型判断逻辑
```

三个核心模块的职责边界和调用关系：

1. `src/scanner/node.ts`（scanNodeProject）是整条流水线的数据源头。它只做静态分析，不调用 LLM，输出的 `ProjectContext` 包含后续所有阶段需要的事实数据。comprehension、insights、planner、generator、reviewer 全部依赖这个结构体，但不会反向修改它。

2. `src/generator/index.ts`（generateSingleSection）和 `src/reviewer/index.ts`（reviewSectionQuality）构成一个紧耦合的生成-审查循环。generator 生成章节内容后立即交给 reviewer 评分；reviewer 返回的 `quality.issues` 会被 generator 拼接为 `regenerationHint` 注入下一轮 prompt。这个循环最多执行 `maxRegenerationAttempts + 1` 次（默认 3 次），两个模块之间通过 `QualityCheck` 类型传递状态。

3. `src/ai/` 目录通过 `AIProvider` 接口将 OpenAI 和 Anthropic 两个 SDK 统一抽象为 `complete(messages, options)` 方法。所有需要调用 LLM 的模块（comprehension、insights、generator、reviewer/ai-review）都只依赖这个接口，不直接引用具体 SDK。切换提供商只需改 `.readme-craft.yml` 中的 `model.provider` 字段或传 `--model` 参数。

`.readme-craft/` 目录不属于源码，是运行时产物：`snapshot.json` 保存完整的 ProjectContext、ProjectUnderstanding、InsightsResult、PlannedOutline 及生成内容，`last-output.txt` 保存最近一次生成的 README 原文。

## 配置说明

readme-craft 采用三层配置合并策略，优先级从高到低：CLI 选项 → `.readme-craft.yml` 配置文件 → 环境变量。配置加载逻辑位于 `src/utils/config.ts` 的 `loadConfig` 函数。

### 配置文件

在项目根目录创建 `.readme-craft.yml` 或 `.readme-craft.yaml`，`loadConfig` 会自动按这两个候选路径查找。

```yaml
# .readme-craft.yml
provider: openai          # 或 anthropic
model: gpt-4o-mini        # 传递给 AIProvider.complete 的模型标识
language: zh              # 输出 README 的语言
output: README.md         # 生成文件的输出路径
apiKey: env:OPENAI_API_KEY # 支持 env:VAR_NAME 语法间接引用环境变量
baseUrl: https://your-proxy.example.com/v1  # 自定义 API 端点，透传给 SDK
```

`apiKey` 字段支持 `env:VAR_NAME` 语法——`resolveApiKey` 会解析该前缀并从对应环境变量读取实际密钥，避免在配置文件中硬编码密钥。

### CLI 选项

`init` 子命令支持以下选项，均可覆盖配置文件中的同名字段：

```bash
readme-craft init \
  --target ./path/to/project \   # 目标项目目录，scanner 阶段的扫描根路径
  --config ./custom-config.yml \ # 指定配置文件路径，跳过自动发现
  --model gpt-4o-mini \          # 覆盖配置文件中的 model
  --language en \                # 覆盖输出语言
  --output README.md \           # 覆盖输出文件路径
  --yes                          # 跳过 inquirer 交互，planner 阶段全选章节
```

`--yes` 影响的是 planner 阶段（`src/planner/index.ts`）：传入 `skipPrompt=true` 时跳过 inquirer checkbox 交互，直接启用所有候选章节。适用于 CI/CD 环境。

### 环境变量

当配置文件和 CLI 均未提供 API 密钥时，`resolveApiKey` 按提供商回退到对应环境变量：

| 提供商 | 环境变量 |
|--------|----------|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |

```bash
export OPENAI_API_KEY=sk-...
readme-craft init --target .
```

### 提供商与模型选择

`createAIProvider`（`src/utils/config.ts`）工厂函数根据 `provider` 字段实例化对应 SDK：

- `openai`：使用 `openai` SDK，默认模型 `gpt-4o-mini`
- `anthropic`：使用 `@anthropic-ai/sdk`

模型标识直接透传给 SDK 的 API 调用。`baseUrl` 同样透传，可用于代理或兼容 API 端点。流水线各阶段使用不同的 `temperature`：comprehension 阶段 `0.1`，insights 阶段 `0.15`，这些值硬编码在各阶段模块中，不可通过配置修改。

### 输出与快照

- `--output` 控制最终 README 的写入路径，默认 `README.md`
- 每次生成完成后，`saveSnapshot` 将完整上下文（`ProjectContext`、`ProjectUnderstanding`、`InsightsResult`、`PlannedOutline` 及各章节内容）序列化写入 `.readme-craft/` 目录
- `.readme-craft/` 目录建议加入 `.gitignore`，除非你需要版本追踪生成快照

### 不可配置的部分

以下行为当前硬编码，无法通过配置修改：

- 质量审查阈值和加权公式（`overallScore = AI均分×0.8 + 规则通过率×10×0.2`）位于 `src/reviewer/index.ts`
- 最大重试次数 `maxRegenerationAttempts` 默认为 2，定义在 `src/generator/index.ts`
- 证据文件选取上限为 8 个（`slice(0, 8)`），定义在 `src/insights/index.ts`
- 各阶段的 `temperature` 值分别硬编码在 `src/comprehension/index.ts` 和 `src/insights/index.ts`
- 6 项确定性规则检查（`src/reviewer/rules.ts`）的启用与否不可单独开关

## 技术栈

项目使用 TypeScript（^5.9.3）编写，ESM 模块格式，顶层 await 入口。编译目标和模块配置见 `tsconfig.json`，产物输出到 `dist/cli/`。

### 运行时依赖

| 包名 | 版本 | 在本项目中的职责 |
|---|---|---|
| `commander` | ^14.0.0 | CLI 框架。当前注册 `init` 一个子命令，接收 `--target`、`--config`、`--model`、`--language`、`--output`、`--yes` 六个选项。入口文件通过 `await program.parseAsync()` 以顶层 await 方式启动。 |
| `openai` | ^5.12.2 | OpenAI API 客户端。由 `createAIProvider` 工厂实例化，作为默认 LLM 提供商（gpt-4o-mini），用于 comprehension（temperature=0.1）、insights（temperature=0.15）、章节生成和 AI 质量评审四个阶段的 `provider.complete` 调用。支持自定义 `baseUrl`。 |
| `@anthropic-ai/sdk` | ^0.79.0 | Anthropic API 客户端。与 openai SDK 通过 `AIProvider` 抽象层统一封装，可通过 `--model` 或 `.readme-craft.yml` 中的 `provider` 字段切换。两个 SDK 共享同一个 `complete` 接口签名，支持 temperature 等参数透传。 |
| `inquirer` | ^12.9.6 | 终端交互。planner 阶段用 checkbox 类型 prompt 让用户勾选要生成的 README 章节；写入前用 confirm prompt 确认输出路径。`--yes` 标志跳过所有交互。 |
| `simple-git` | ^3.28.0 | Git 操作。`collectGitSummary`（`src/scanner/node.ts`）通过它读取提交历史，统计文件变更频率生成 `hotFiles` 列表，用于 insights 阶段的证据文件优先级排序——变更频繁的文件优先被选为 LLM 输入。 |
| `js-yaml` | ^4.1.0 | YAML 解析。`loadConfig`（`src/utils/config.ts`）用它读取 `.readme-craft.yml` / `.readme-craft.yaml` 配置文件，解析出 provider、model、language、outputFile、apiKey 等字段，与 CLI 选项和环境变量三层合并。 |

### 开发依赖

| 包名 | 版本 | 用途 |
|---|---|---|
| `typescript` | ^5.9.3 | 编译器。`npm run build` 执行 `tsc -p tsconfig.json`，`npm run check` 执行 `tsc --noEmit` 做类型检查。 |
| `tsx` | ^4.20.5 | 开发时直接运行 TypeScript。`npm run dev` 执行 `tsx src/cli/index.ts`，免编译启动 CLI。 |
| `@types/node` | ^24.5.2 | Node.js 类型定义。 |
| `@types/js-yaml` | ^4.0.9 | js-yaml 类型定义。 |

### 值得注意的点

- 项目没有测试框架依赖。当前仓库的质量门槛是 `tsc --noEmit` 类型检查，没有单元测试或集成测试命令。
- 没有 bundler（无 webpack/rollup/esbuild）——直接用 `tsc` 编译，产物是原生 ESM `.js` 文件。
- LLM 输出的 JSON 解析不依赖第三方库，`src/utils/json.ts` 中的 `safeParseJson` 自行实现了多层容错链（代码块提取 → 平衡括号匹配 → 智能引号修复 → 尾逗号清理 → 综合修复），处理 LLM 返回的非标准 JSON。
- 两个 AI SDK 是运行时必装的，即使你只用其中一个提供商。目前没有做按需加载或 optional peer dependency。

## 贡献指南

### 环境准备

```bash
git clone <repo-url> && cd readme-craft
npm install
```

项目是 TypeScript ESM，入口在 `src/cli/index.ts`，编译输出到 `dist/cli/`。

### 开发流程

本地运行（不需要先编译）：

```bash
npm run dev -- init --target ../your-test-project
```

`dev` 脚本通过 `tsx` 直接执行 TypeScript 源码，等价于 `tsx src/cli/index.ts`。加 `--` 后传入 CLI 参数。

类型检查：

```bash
npm run check
```

这会执行 `tsc --noEmit`，只检查类型不产出文件。提交前务必跑一次。

构建：

```bash
npm run build
```

输出到 `dist/`，入口为 `dist/cli/index.js`。

### 当前质量门槛

项目目前没有测试脚本（`package.json` 中无 `test` 命令），也没有 linter 配置。当前唯一的自动化质量门槛是 `npm run check` 的 TypeScript 类型检查。如果你打算贡献测试框架的集成，欢迎。

### 代码结构与改动指引

流水线五阶段串行执行，由 `src/cli/init.ts` 的 `runInitCommand` 编排，数据流方向：

```
scanner → comprehension → insights → planner → generator + reviewer
```

每阶段输出是下一阶段的输入，改动某阶段时需要理解它接收和产出的数据结构。关键模块位置：

| 阶段 | 入口文件 | 核心函数 |
|------|---------|---------|
| 扫描 | `src/scanner/node.ts` | `scanNodeProject` → `ProjectContext` |
| 理解 | `src/comprehension/index.ts` | `buildProjectUnderstanding` → `ProjectUnderstanding` |
| 洞察 | `src/insights/index.ts` | `buildProjectInsights` → `InsightsResult` |
| 规划 | `src/planner/index.ts` | `planReadmeOutline` → `PlannedOutline` |
| 生成 | `src/generator/index.ts` | `generateReadmeSections` |
| 审查 | `src/reviewer/index.ts` | `reviewSectionQuality` |

几个容易踩坑的地方：

- `src/utils/json.ts` 的 `safeParseJson` 有多层容错逻辑（代码块提取→平衡括号→智能引号修复→尾逗号清理→综合修复），改动时注意不要破坏这条链的顺序。
- `src/generator/sections/index.ts` 中 `buildSectionRequirements` 和 `buildSectionContext` 按章节类型分别定义写作要求和上下文注入策略，新增章节类型需要同时扩展这两处。
- `src/reviewer/rules.ts` 的 6 项确定性规则（`hasInstallSteps`/`installStepsRunnable`/`hasCodeExamples`/`linksValid`/`badgesCorrect`/`noPlaceholders`）参与 `overallScore` 的加权计算（权重 0.2），新增规则会影响评分。
- AI 提供商通过 `src/utils/ai.ts` 的 `createAIProvider` 工厂创建，新增提供商需实现 `AIProvider` 接口。

### 提交建议

- 确保 `npm run check` 通过，零类型错误。
- 如果改动涉及 LLM prompt（散布在 `comprehension`/`insights`/`generator`/`reviewer` 各模块），请在 PR 描述中附上改动前后对同一项目的生成结果对比。
- `.readme-craft/` 目录存放生成快照，不要提交到仓库。

### 许可

贡献代码默认遵循项目的 MIT 许可证。

## 许可证

MIT License。完整文本见仓库根目录 [LICENSE](./LICENSE) 文件。

scanner 阶段的 `detectLicense`（`src/scanner/node.ts`）会自动从目标项目的 `package.json` `license` 字段和 LICENSE 文件中识别许可证类型，并写入 `ProjectContext`。planner 阶段将 `license` 作为 8 个通用候选章节之一纳入大纲。生成时 `buildSectionPrompt` 会注入实际检测到的许可证类型，确保输出的许可证章节与项目声明一致。

readme-craft 本身的依赖（commander、simple-git、inquirer、openai SDK、@anthropic-ai/sdk 等）各有独立许可证，使用前请自行确认兼容性。
