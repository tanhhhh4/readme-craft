import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, ChatMessage } from "./provider.js";

export class AnthropicProvider implements AIProvider {
  private readonly client: Anthropic;

  constructor(
    private readonly model: string,
    apiKey?: string,
    baseURL?: string
  ) {
    if (!apiKey) {
      throw new Error(
        "Missing Anthropic API key. Set ANTHROPIC_API_KEY or configure .readme-craft.yml."
      );
    }

    this.client = new Anthropic({
      apiKey,
      ...(baseURL ? { baseURL } : {})
    });
  }

  async complete(messages: ChatMessage[], options?: { temperature?: number }): Promise<string> {
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content.trim())
      .filter(Boolean)
      .join("\n\n");

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      ...(system ? { system } : {}),
      messages: messages
        .filter((message) => message.role === "user")
        .map((message) => ({
          role: "user" as const,
          content: message.content
        })),
      temperature: options?.temperature ?? 0.2
    });

    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
  }
}
