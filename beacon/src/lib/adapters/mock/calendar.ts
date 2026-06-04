import type {
  CalendarAdapter,
  CreateEventInput,
  CreateEventResult,
  FreeBusySlot,
} from "../types.js";
import { mockId } from "./outbox.js";

/**
 * Deterministic mock calendar. Marks a fixed "busy" block every weekday
 * 12:00–13:00 UTC (lunch) so booking logic has something real to avoid, and
 * otherwise treats business hours as free.
 */
export class MockCalendarAdapter implements CalendarAdapter {
  readonly name = "mock-calendar";
  private events: CreateEventInput[] = [];

  async getBusy(_calendarId: string, from: string, to: string): Promise<FreeBusySlot[]> {
    const start = new Date(from);
    const end = new Date(to);
    const busy: FreeBusySlot[] = [];
    const cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 12, 0, 0),
    );
    while (cursor < end) {
      const day = cursor.getUTCDay();
      if (day !== 0 && day !== 6 && cursor >= start) {
        const slotEnd = new Date(cursor.getTime() + 60 * 60 * 1000);
        busy.push({ start: cursor.toISOString(), end: slotEnd.toISOString() });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    // Also report any events created in this process as busy.
    for (const ev of this.events) busy.push({ start: ev.start, end: ev.end });
    return busy;
  }

  async createEvent(input: CreateEventInput): Promise<CreateEventResult> {
    this.events.push(input);
    return { eventId: mockId("ev") };
  }
}
