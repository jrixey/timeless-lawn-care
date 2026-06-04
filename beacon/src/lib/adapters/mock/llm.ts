import type { LlmAdapter, LlmCompleteInput, LlmCompleteResult } from "../types.js";
import { extractSlots } from "../../ai/extract.js";

/**
 * Deterministic mock LLM. It recognizes the receptionist's two modes via a
 * sentinel in the system prompt:
 *   - "MODE: EXTRACT"  → return JSON slots parsed from the last user message
 *                        (delegates to the shared `extractSlots`).
 *   - otherwise        → return a short, deterministic acknowledgement so the
 *                        engine's templated phrasing path stays reproducible.
 * The real Anthropic adapter performs the same contract via the model.
 */
export class MockLlmAdapter implements LlmAdapter {
  readonly name = "mock-llm";

  async complete(input: LlmCompleteInput): Promise<LlmCompleteResult> {
    if (input.system.includes("MODE: EXTRACT")) {
      const lastUser = [...input.messages].reverse().find((m) => m.role === "user");
      const slots = extractSlots(lastUser?.content ?? "");
      return { text: JSON.stringify(slots), stopReason: "end_turn" };
    }
    // Phrasing mode: echo a neutral acknowledgement. The engine supplies the
    // actual customer-facing copy via templates, so this stays deterministic.
    return { text: "Okay.", stopReason: "end_turn" };
  }
}
