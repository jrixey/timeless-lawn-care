import type { Adapters } from "@/lib/adapters";
import {
  initialState,
  runTurn,
  type ReceptionistConfig,
  type ReceptionistState,
} from "./receptionist.js";
import type { Slot } from "./availability.js";
import type { Slots } from "./extract.js";

export interface TranscriptLine {
  speaker: "assistant" | "caller";
  text: string;
}

export interface HarnessResult {
  transcript: TranscriptLine[];
  finalState: ReceptionistState;
  booking: Slot | null;
  booked: boolean;
  slots: Slots;
}

/**
 * Drive a scripted call through the receptionist. The first assistant line is
 * the greeting (empty caller turn), then each scripted caller line is answered.
 * Deterministic in mock mode → ideal for regression tests of qualify + book.
 */
export async function runScriptedCall(
  adapters: Adapters,
  cfg: ReceptionistConfig,
  callerLines: string[],
  opts: { seedSlots?: Partial<Slots>; now?: Date } = {},
): Promise<HarnessResult> {
  const now = opts.now ?? new Date("2026-06-08T15:00:00Z"); // a Monday
  let state = initialState(opts.seedSlots);
  const transcript: TranscriptLine[] = [];
  let booking: Slot | null = null;

  // Opening greeting turn.
  let turn = await runTurn(adapters, cfg, state, "", now);
  state = turn.state;
  transcript.push({ speaker: "assistant", text: turn.reply });

  for (const line of callerLines) {
    transcript.push({ speaker: "caller", text: line });
    turn = await runTurn(adapters, cfg, state, line, now);
    state = turn.state;
    transcript.push({ speaker: "assistant", text: turn.reply });
    if (turn.booking) booking = turn.booking;
    if (state.phase === "booked" || state.phase === "handoff") break;
  }

  return {
    transcript,
    finalState: state,
    booking,
    booked: state.phase === "booked",
    slots: state.slots,
  };
}
