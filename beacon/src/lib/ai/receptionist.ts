import type { Adapters } from "@/lib/adapters";
import type { AiConfig, BusinessHours } from "@/lib/domain/types";
import { emptySlots, extractSlots, mergeSlots, type ServiceType, type Slots } from "./extract.js";
import { findNextAvailableSlot, formatSlot, type Slot } from "./availability.js";

export interface ReceptionistConfig {
  clientName: string;
  ai: AiConfig;
  businessHours: BusinessHours;
}

export type Phase = "greeting" | "collecting" | "proposing" | "booked" | "handoff";

export interface ReceptionistState {
  slots: Slots;
  phase: Phase;
  proposed: Slot | null;
}

export interface TurnResult {
  reply: string;
  state: ReceptionistState;
  action: "greet" | "ask" | "propose" | "book" | "handoff" | "end";
  booking: Slot | null;
}

export function initialState(seed?: Partial<Slots>): ReceptionistState {
  return {
    slots: { ...emptySlots(), ...seed },
    phase: "greeting",
    proposed: null,
  };
}

const SERVICE_LABEL: Record<ServiceType, string> = {
  ac_repair: "A/C repair",
  ac_install: "A/C installation",
  heating_repair: "heating repair",
  heating_install: "heating installation",
  maintenance: "a maintenance visit",
  other: "service",
};

const BASE_REQUIRED: (keyof Slots)[] = ["service", "name", "phone", "preferredTime"];

/** Emergencies don't need a preferred time — we grab the earliest opening. */
function requiredFields(slots: Slots): (keyof Slots)[] {
  return slots.urgency === "emergency"
    ? ["service", "name", "phone"]
    : BASE_REQUIRED;
}

function isConfirm(t: string): boolean {
  return /\b(yes|yeah|yep|sure|sounds good|that works|works for me|ok|okay|book it|confirm|perfect|great)\b/i.test(
    t,
  );
}
function isDecline(t: string): boolean {
  return /\b(no|nope|can'?t|cannot|doesn'?t work|another time|different time|reschedule|earlier|later)\b/i.test(
    t,
  );
}

/**
 * Build the per-client system persona for the LLM. In live mode this shapes the
 * model's phrasing; the engine still owns the deterministic flow + fallback.
 */
export function buildSystemPrompt(cfg: ReceptionistConfig): string {
  const ai = cfg.ai;
  const tone = ai.tone ?? "friendly";
  return [
    `You are the virtual receptionist for ${cfg.clientName}, an HVAC company.`,
    `Tone: ${tone}, concise, helpful. You answer calls, qualify the lead, and book a visit.`,
    ai.services?.length ? `Services offered: ${ai.services.join(", ")}.` : "",
    ai.hoursSummary ? `Hours: ${ai.hoursSummary}.` : "",
    ai.pricing ? `Pricing guidance: ${ai.pricing}.` : "",
    `Always collect: the problem/service, the caller's name, a callback number, and a preferred time.`,
    `If it is an emergency (no heat, no cooling, leak), reassure them and prioritize the earliest slot.`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function extract(adapters: Adapters, userText: string): Promise<Slots> {
  if (!userText.trim()) return emptySlots();
  try {
    const res = await adapters.llm.complete({
      system: "MODE: EXTRACT. Return ONLY JSON of extracted booking slots.",
      messages: [{ role: "user", content: userText }],
      temperature: 0,
      maxTokens: 256,
    });
    const parsed = JSON.parse(res.text) as Partial<Slots>;
    // Validate shape; fall back to deterministic extraction on anything odd.
    return mergeSlots(emptySlots(), { ...emptySlots(), ...parsed });
  } catch {
    // Deterministic fallback — guarantees the receptionist works even if the
    // LLM is unavailable or returns unparseable output.
    return extractSlots(userText);
  }
}

function nextQuestion(slots: Slots): { field: keyof Slots; text: string } {
  const missing = requiredFields(slots).find((f) => !slots[f])!;
  switch (missing) {
    case "service":
      return { field: "service", text: "What can we help you with today — is it heating, cooling, or something else?" };
    case "name":
      return { field: "name", text: "Happy to help with that. Can I get your name?" };
    case "phone":
      return { field: "phone", text: "What's the best phone number to reach you at?" };
    case "preferredTime":
      return { field: "preferredTime", text: "When would be a good time for a technician to come by?" };
    default:
      return { field: "service", text: "How can we help?" };
  }
}

/**
 * Run a single conversational turn. Pure with respect to its inputs aside from
 * the (mockable) adapters for extraction and calendar availability. Deterministic
 * in mock mode, which keeps the transcript test harness reproducible.
 */
export async function runTurn(
  adapters: Adapters,
  cfg: ReceptionistConfig,
  state: ReceptionistState,
  userText: string,
  now: Date = new Date(),
): Promise<TurnResult> {
  let slots = state.slots;

  // Opening turn: greet and ask the first open question.
  if (state.phase === "greeting") {
    const greeting =
      cfg.ai.greeting ?? `Thanks for calling ${cfg.clientName}! How can I help you today?`;
    const merged = userText.trim() ? mergeSlots(slots, await extract(adapters, userText)) : slots;
    const q = nextQuestion(merged);
    return {
      reply: userText.trim() ? `${greeting} ${q.text}` : greeting,
      state: { slots: merged, phase: "collecting", proposed: null },
      action: "greet",
      booking: null,
    };
  }

  slots = mergeSlots(slots, await extract(adapters, userText));

  // Awaiting confirmation of a proposed time.
  if (state.phase === "proposing" && state.proposed) {
    if (isConfirm(userText) && !isDecline(userText)) {
      return {
        reply: `You're all set for ${formatSlot(state.proposed)}. We'll text you a confirmation. Thanks!`,
        state: { slots, phase: "booked", proposed: state.proposed },
        action: "book",
        booking: state.proposed,
      };
    }
    if (isDecline(userText)) {
      // Caller wants a different time — clear preferred time and re-collect.
      const cleared: Slots = { ...slots, preferredTime: null };
      return {
        reply: "No problem — what day or time works better for you?",
        state: { slots: cleared, phase: "collecting", proposed: null },
        action: "ask",
        booking: null,
      };
    }
    // Unclear reply — re-confirm.
    return {
      reply: `Just to confirm, does ${formatSlot(state.proposed)} work for you?`,
      state: { slots, phase: "proposing", proposed: state.proposed },
      action: "propose",
      booking: null,
    };
  }

  // Still collecting required info?
  const missing = requiredFields(slots).find((f) => !slots[f]);
  if (missing) {
    const q = nextQuestion(slots);
    return {
      reply: q.text,
      state: { slots, phase: "collecting", proposed: null },
      action: "ask",
      booking: null,
    };
  }

  // All info collected → propose the next available slot.
  const busy = await adapters.calendar
    .getBusy("primary", now.toISOString(), new Date(now.getTime() + 15 * 864e5).toISOString())
    .catch(() => []);
  const slot = findNextAvailableSlot({
    now,
    businessHours: cfg.businessHours,
    durationMin: cfg.ai.appointmentMinutes ?? 90,
    busy,
    // Emergencies get the earliest possible slot.
    leadMinutes: slots.urgency === "emergency" ? 60 : 120,
    horizonDays: cfg.ai.bookingWindowDays ?? 14,
  });

  if (!slot) {
    return {
      reply:
        "I'm not finding an opening in our online schedule — let me have a team member call you right back to get you booked.",
      state: { slots, phase: "handoff", proposed: null },
      action: "handoff",
      booking: null,
    };
  }

  const svc = slots.service ? SERVICE_LABEL[slots.service] : "your visit";
  const emergencyNote =
    slots.urgency === "emergency"
      ? "I understand this is urgent, so I grabbed our earliest opening. "
      : "";
  return {
    reply: `${emergencyNote}I can get a technician out for ${svc} on ${formatSlot(slot)}. Does that work?`,
    state: { slots, phase: "proposing", proposed: slot },
    action: "propose",
    booking: null,
  };
}
