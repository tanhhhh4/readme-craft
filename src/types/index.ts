export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
}

export interface Dep {
  name: string;
  version: string;
}

export interface CommentInfo {
  file: string;
  line: number;
  text: string;
}

export interface FunctionSignature {
  name: string;
  kind: "function" | "class" | "method" | "const";
  exported: boolean;
  signature: string;
}

export interface ModuleInfo {
  file: string;
  summary: string;
  exports: FunctionSignature[];
  routeHints: string[];
  importance: number;
}

export interface ProjectContext {
  rootDir: string;
  projectType: "library" | "cli" | "web-app" | "api-service" | "node-app";
  name: string;
  language: string;
  framework: string[];
  packageManager: string;
  entryPoints: string[];
  structure: TreeNode;
  coreModules: ModuleInfo[];
  dependencies: Dep[];
  devDependencies: Dep[];
  scripts: Record<string, string>;
  existingDocs: string[];
  codeComments: CommentInfo[];
  license: string;
  contributors: number;
  lastCommit: string | null;
  hotFiles: string[];
  routeEndpoints: string[];
  configurationFiles: string[];
}

export interface ProjectUnderstanding {
  oneLiner: string;
  problem: string;
  solution: string;
  architecture: string;
  keyFeatures: string[];
  targetAudience: string;
  techHighlights: string[];
}

export interface InsightsResult {
  summary: string;
  usp: string[];
  designDecisions: string[];
  notablePatterns: string[];
  evidence: string[];
  recommendedAngles: string[];
}

export interface OutlineSection {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  reason?: string;
}

export interface PlannedOutline {
  template: ProjectContext["projectType"];
  sections: OutlineSection[];
}

export interface GeneratedSection {
  id: string;
  title: string;
  content: string;
  attempts: number;
  quality: QualityCheck;
}

export interface QualityCheck {
  hasInstallSteps: boolean;
  installStepsRunnable: boolean;
  hasCodeExamples: boolean;
  linksValid: boolean;
  badgesCorrect: boolean;
  noPlaceholders: boolean;
  clarity: number;
  completeness: number;
  accuracy: number;
  actionability: number;
  overallScore: number;
  issues: string[];
}

export interface ModelConfig {
  provider: "openai" | "anthropic";
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface AppConfig {
  model: ModelConfig;
  language: string;
  maxRegenerationAttempts: number;
  outputFile: string;
}

export interface InitOptions {
  targetDir: string;
  configPath?: string;
  model?: string;
  language?: string;
  output?: string;
  yes?: boolean;
}

export interface Snapshot {
  generatedAt: string;
  projectContext: ProjectContext;
  projectUnderstanding: ProjectUnderstanding;
  insights: InsightsResult;
  outline: PlannedOutline;
  readmePath: string;
}
