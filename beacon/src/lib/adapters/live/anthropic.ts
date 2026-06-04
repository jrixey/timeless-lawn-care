import Anthropic from "@anthropic-ai/sdk";
import type { LlmAdapter, LlmCompleteInput, LlmCompleteResult } from "../types.js";
import { env } from "../../env.js";

export class AnthropicLlmAdapter implements LlmAdapter {
  readonly name = "anthropic-llm";
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!env.anthropic.apiKey) {
      throw new Error("Anthropic live provider selected but ANTHROPIC_API_KEY is unset");
    }
    this.client ??= new Anthropic({ apiKey: env.anthropic.apiKey });
    return this.client;
  }

  async complete(input: LlmCompleteInput): Promise<LlmCompleteResult> {
    const res = await this.getClient().messages.create({
      model: env.anthropic.model,
      max_tokens: input.maxTokens ?? 512,
      temperature: input.temperature ?? 0.2,
      system: input.system,
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const stopReason: LlmCompleteResult["stopReason"] =
      res.stop_reason === "max_tokens" ? "max_tokens" : "end_turn";
    return { text, stopReason };
  }
}
