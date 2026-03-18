import { promises as fs } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { AppConfig, InitOptions } from "../types/index.js";
import { pathExists } from "./fs.js";

const DEFAULT_CONFIG: AppConfig = {
  model: {
    provider: "openai",
    model: "gpt-4o-mini"
  },
  language: "zh",
  maxRegenerationAttempts: 2,
  outputFile: "README.md"
};

export async function loadConfig(options: InitOptions): Promise<AppConfig> {
  const targetDir = path.resolve(options.targetDir);
  const candidatePaths = [
    options.configPath,
    path.join(targetDir, ".readme-craft.yml"),
    path.join(targetDir, ".readme-craft.yaml")
  ].filter((value): value is string => Boolean(value));

  let loaded: Partial<AppConfig> = {};
  for (const candidate of candidatePaths) {
    if (!(await pathExists(candidate))) {
      continue;
    }

    const raw = await fs.readFile(candidate, "utf8");
    loaded = (yaml.load(raw) as Partial<AppConfig>) ?? {};
    break;
  }

  const provider = loaded.model?.provider ?? DEFAULT_CONFIG.model.provider;
  const model =
    loaded.model?.model ?? options.model ?? getDefaultModelForProvider(provider);
  const apiKey =
    resolveApiKey(loaded.model?.apiKey) ?? getApiKeyFromEnvironment(provider);
  const baseUrl = loaded.model?.baseUrl;

  return {
    model: {
      provider,
      model,
      ...(apiKey ? { apiKey } : {}),
      ...(baseUrl ? { baseUrl } : {})
    },
    language: options.language ?? loaded.language ?? DEFAULT_CONFIG.language,
    maxRegenerationAttempts:
      loaded.maxRegenerationAttempts ?? DEFAULT_CONFIG.maxRegenerationAttempts,
    outputFile: options.output ?? loaded.outputFile ?? DEFAULT_CONFIG.outputFile
  };
}

function getDefaultModelForProvider(provider: AppConfig["model"]["provider"]): string {
  switch (provider) {
    case "anthropic":
      return "claude-sonnet-4-20250514";
    case "openai":
    default:
      return DEFAULT_CONFIG.model.model;
  }
}

function getApiKeyFromEnvironment(
  provider: AppConfig["model"]["provider"]
): string | undefined {
  switch (provider) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "openai":
    default:
      return process.env.OPENAI_API_KEY;
  }
}

function resolveApiKey(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value.startsWith("env:")) {
    return process.env[value.slice(4)];
  }

  return value;
}
