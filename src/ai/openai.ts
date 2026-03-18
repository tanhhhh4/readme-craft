import OpenAI from "openai";
import type { AIProvider, ChatMessage } from "./provider.js";

export class OpenAIProvider implements AIProvider {
  private readonly client: OpenAI;

  constructor(
    private readonly model: string,
    apiKey?: string
  ) {
    if (!apiKey) {
      throw new Error("Missing OpenAI API key. Set OPENAI_API_KEY or configure .readme-craft.yml.");
    }

    this.client = new OpenAI({ apiKey });
  }

  async complete(messages: ChatMessage[], options?: { temperature?: number }): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content
      })),
      temperature: options?.temperature ?? 0.2
    });

    return response.choices[0]?.message?.content?.trim() ?? "";
  }
}
