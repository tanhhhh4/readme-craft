export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface AIProvider {
  complete(messages: ChatMessage[], options?: { temperature?: number }): Promise<string>;
}
