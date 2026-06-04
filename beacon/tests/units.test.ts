import { describe, it, expect } from "vitest";
import { extractSlots, mergeSlots, emptySlots } from "../src/lib/ai/extract.js";
import { findNextAvailableSlot } from "../src/lib/ai/availability.js";
import { isQuietHour, nextAllowedTime } from "../src/lib/workflows/quiet-hours.js";
import { isStopKeyword, isStartKeyword } from "../src/lib/workflows/opt-out.js";
import { redact } from "../src/lib/log.js";

describe("slot extraction", () => {
  it("extracts service, urgency, name, phone", () => {
    const s = extractSlots("Hi my name is Dana, my AC is not working, call me at 555-123-4567");
    expect(s.service).toBe("ac_repair");
    expect(s.urgency).toBe("emergency");
    expect(s.name).toBe("Dana");
    expect(s.phone).toBe("+15551234567");
  });

  it("detects install vs repair", () => {
    expect(extractSlots("I need a new AC unit installed").service).toBe("ac_install");
    expect(extractSlots("furnace won't turn on, no heat").service).toBe("heating_repair");
  });

  it("merges with new values winning", () => {
    const merged = mergeSlots(
      { ...emptySlots(), name: "Old", service: "ac_repair" },
      { ...emptySlots(), name: "New" },
    );
    expect(merged.name).toBe("New");
    expect(merged.service).toBe("ac_repair");
  });
});

describe("availability", () => {
  it("finds a weekday slot within business hours", () => {
    const slot = findNextAvailableSlot({ now: new Date("2026-06-08T06:00:00Z") }); // Monday
    expect(slot).not.toBeNull();
    const start = new Date(slot!.start);
    expect(start.getUTCDay()).toBeGreaterThanOrEqual(1);
  });

  it("skips busy intervals", () => {
    const now = new Date("2026-06-08T06:00:00Z");
    const busy = [{ start: "2026-06-08T08:00:00Z", end: "2026-06-08T12:00:00Z" }];
    const slot = findNextAvailableSlot({ now, busy, durationMin: 90 });
    expect(new Date(slot!.start).getTime()).toBeGreaterThanOrEqual(
      new Date("2026-06-08T12:00:00Z").getTime(),
    );
  });
});

describe("quiet hours", () => {
  it("detects overnight quiet window 21->8", () => {
    expect(isQuietHour(new Date("2026-06-08T23:00:00Z"), 21, 8)).toBe(true);
    expect(isQuietHour(new Date("2026-06-08T03:00:00Z"), 21, 8)).toBe(true);
    expect(isQuietHour(new Date("2026-06-08T15:00:00Z"), 21, 8)).toBe(false);
  });
  it("advances to the next allowed time", () => {
    const next = nextAllowedTime(new Date("2026-06-08T23:30:00Z"), 21, 8);
    expect(next.getUTCHours()).toBe(8);
  });
});

describe("opt-out keywords", () => {
  it("recognizes STOP/START", () => {
    expect(isStopKeyword("STOP")).toBe(true);
    expect(isStopKeyword("  unsubscribe ")).toBe(true);
    expect(isStopKeyword("stop it please")).toBe(false);
    expect(isStartKeyword("start")).toBe(true);
  });
});

describe("log redaction", () => {
  it("redacts emails, phones, and secret keys", () => {
    const out = redact({ email: "a@b.com", phone: "+15551234567", apiKey: "sk-123", body: "hello" });
    const s = JSON.stringify(out);
    expect(s).not.toContain("a@b.com");
    expect(s).not.toContain("5551234567");
    expect(s).not.toContain("sk-123");
    expect(s).toContain("[redacted]");
  });
});
