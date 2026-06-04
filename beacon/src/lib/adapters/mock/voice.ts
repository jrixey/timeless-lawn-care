import type { VoiceAdapter, PlaceCallInput, PlaceCallResult } from "../types.js";
import { outbox, mockId } from "./outbox.js";

export class MockVoiceAdapter implements VoiceAdapter {
  readonly name = "mock-voice";

  async placeCall(input: PlaceCallInput): Promise<PlaceCallResult> {
    const providerCallId = mockId("ca");
    outbox.record({
      kind: "call",
      to: input.to,
      from: input.from,
      providerCallId,
      at: new Date().toISOString(),
    });
    return { providerCallId, status: "in_progress" };
  }
}
