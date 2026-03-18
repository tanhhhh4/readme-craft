import type { AppConfig } from "../types/index.js";
import type { AIProvider } from "./provider.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";

export function createAIProvider(config: AppConfig): AIProvider {
  if (config.model.provider === "openai") {
    return new OpenAIProvider(config.model.model, config.model.apiKey);
  }

  if (config.model.provider === "anthropic") {
    return new AnthropicProvider(config.model.model, config.model.apiKey, config.model.baseUrl);
  }

  throw new Error(`Unsupported AI provider: ${config.model.provider}`);
}
