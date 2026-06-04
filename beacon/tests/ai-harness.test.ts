import { describe, it, expect } from "vitest";
import { getAdapters } from "../src/lib/adapters/index.js";
import type { Adapters, LlmAdapter } from "../src/lib/adapters/types.js";
import { MockSmsAdapter } from "../src/lib/adapters/mock/sms.js";
import { MockVoiceAdapter } from "../src/lib/adapters/mock/voice.js";
import { MockEmailAdapter } from "../src/lib/adapters/mock/email.js";
import { MockCalendarAdapter } from "../src/lib/adapters/mock/calendar.js";
import { runScriptedCall } from "../src/lib/ai/harness.js";
import type { ReceptionistConfig } from "../src/lib/ai/receptionist.js";

const cfg: ReceptionistConfig = {
  clientName: "Northwind Heating & Air",
  ai: { tone: "friendly", appointmentMinutes: 90, bookingWindowDays: 14 },
  businessHours: {},
};

const BOOKING_SCRIPT = [
  "Hi my name is Dana, my AC is not working",
  "my number is 555-123-4567",
  "tomorrow afternoon works",
  "yes that works",
];

describe("AI receptionist transcript harness", () => {
  it("qualifies and books a call (mock LLM)", async () => {
    const res = await runScriptedCall(getAdapters(), cfg, BOOKING_SCRIPT);
    expect(res.booked).toBe(true);
    expect(res.booking).not.toBeNull();
    expect(res.slots.name).toBe("Dana");
    expect(res.slots.service).toBe("ac_repair");
    expect(res.slots.phone).toBe("+15551234567");
    // Greeting + at least one proposal + a confirmation line.
    expect(res.transcript[0]!.speaker).toBe("assistant");
    expect(res.transcript.some((l) => /work\?|all set/i.test(l.text))).toBe(true);
  });

  it("still books when the LLM is broken (deterministic fallback)", async () => {
    const brokenLlm: LlmAdapter = {
      name: "broken",
      async complete() {
        return { text: "<<<not json>>>", stopReason: "end_turn" };
      },
    };
    const adapters: Adapters = {
      sms: new MockSmsAdapter(),
      voice: new MockVoiceAdapter(),
      email: new MockEmailAdapter(),
      calendar: new MockCalendarAdapter(),
      llm: brokenLlm,
    };
    const res = await runScriptedCall(adapters, cfg, BOOKING_SCRIPT);
    expect(res.booked).toBe(true);
    expect(res.slots.name).toBe("Dana");
  });

  it("asks for missing info before proposing a time", async () => {
    const res = await runScriptedCall(getAdapters(), cfg, ["I need help with my heater"]);
    // Only service known; should still be collecting (asked a question, not booked).
    expect(res.booked).toBe(false);
    const last = res.transcript[res.transcript.length - 1]!;
    expect(last.text).toMatch(/\?$/);
  });

  it("prioritizes the earliest slot for emergencies", async () => {
    const res = await runScriptedCall(getAdapters(), cfg, [
      "no heat emergency, I'm Sam, call 555-987-6543, as soon as possible",
      "yes",
    ]);
    expect(res.slots.urgency).toBe("emergency");
    expect(res.booked).toBe(true);
  });
});
