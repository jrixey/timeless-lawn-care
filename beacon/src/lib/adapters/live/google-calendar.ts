import type {
  CalendarAdapter,
  CreateEventInput,
  CreateEventResult,
  FreeBusySlot,
} from "../types.js";
import { env } from "../../env.js";

/**
 * Minimal Google Calendar adapter. A real deployment supplies an OAuth access
 * token per client (stored encrypted, out of scope for the MVP); here we read a
 * token from the input's calendarId convention `calendarId|accessToken` to keep
 * the swap a one-liner once tokens are wired in.
 */
function split(calendarId: string): { id: string; token: string } {
  const [id, token] = calendarId.split("|");
  if (!env.google.clientId) {
    throw new Error("Google live provider selected but GOOGLE_CLIENT_ID is unset");
  }
  if (!token) throw new Error("Google Calendar adapter requires an access token in calendarId");
  return { id: id ?? "primary", token };
}

export class GoogleCalendarAdapter implements CalendarAdapter {
  readonly name = "google-calendar";

  async getBusy(calendarId: string, from: string, to: string): Promise<FreeBusySlot[]> {
    const { id, token } = split(calendarId);
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: from, timeMax: to, items: [{ id }] }),
    });
    if (!res.ok) throw new Error(`Google freeBusy failed: ${res.status}`);
    const json = (await res.json()) as {
      calendars: Record<string, { busy: FreeBusySlot[] }>;
    };
    return json.calendars[id]?.busy ?? [];
  }

  async createEvent(input: CreateEventInput): Promise<CreateEventResult> {
    const { id, token } = split(input.calendarId);
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: input.title,
          description: input.description,
          start: { dateTime: input.start },
          end: { dateTime: input.end },
          attendees: input.attendeeEmail ? [{ email: input.attendeeEmail }] : undefined,
        }),
      },
    );
    if (!res.ok) throw new Error(`Google createEvent failed: ${res.status}`);
    const json = (await res.json()) as { id: string };
    return { eventId: json.id };
  }
}
