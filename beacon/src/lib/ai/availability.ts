import type { BusinessHours } from "@/lib/domain/types";
import type { FreeBusySlot } from "@/lib/adapters/types";

export interface Slot {
  start: string; // ISO
  end: string; // ISO
}

const DEFAULT_HOURS: BusinessHours = {
  "0": null, // Sun closed
  "1": [8, 17],
  "2": [8, 17],
  "3": [8, 17],
  "4": [8, 17],
  "5": [8, 17],
  "6": [9, 13], // Sat half day
};

function overlaps(aStart: number, aEnd: number, busy: FreeBusySlot[]): boolean {
  return busy.some((b) => {
    const bs = new Date(b.start).getTime();
    const be = new Date(b.end).getTime();
    return aStart < be && bs < aEnd;
  });
}

/**
 * Deterministically find the next available appointment slot. For the MVP,
 * business hours are interpreted in UTC (a real deployment converts via the
 * client's timezone). Steps day-by-day from `now + leadMs`, scanning each open
 * day in `durationMin` increments, skipping any busy intervals.
 */
export function findNextAvailableSlot(args: {
  now: Date;
  businessHours?: BusinessHours;
  durationMin?: number;
  busy?: FreeBusySlot[];
  leadMinutes?: number;
  horizonDays?: number;
}): Slot | null {
  const hours =
    args.businessHours && Object.keys(args.businessHours).length > 0
      ? args.businessHours
      : DEFAULT_HOURS;
  const duration = (args.durationMin ?? 90) * 60 * 1000;
  const lead = (args.leadMinutes ?? 120) * 60 * 1000;
  const busy = args.busy ?? [];
  const earliest = args.now.getTime() + lead;
  const horizon = args.horizonDays ?? 14;

  for (let d = 0; d <= horizon; d++) {
    const day = new Date(args.now.getTime() + d * 24 * 60 * 60 * 1000);
    const dow = String(day.getUTCDay());
    const window = hours[dow];
    if (!window) continue;
    const [openH, closeH] = window;
    let cursor = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), openH, 0, 0);
    const close = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), closeH, 0, 0);
    while (cursor + duration <= close) {
      if (cursor >= earliest && !overlaps(cursor, cursor + duration, busy)) {
        return {
          start: new Date(cursor).toISOString(),
          end: new Date(cursor + duration).toISOString(),
        };
      }
      cursor += duration;
    }
  }
  return null;
}

export function formatSlot(slot: Slot): string {
  const d = new Date(slot.start);
  const date = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `${date} at ${time}`;
}
