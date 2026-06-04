/**
 * Quiet-hours logic for automated outbound SMS. Hours are inclusive of the
 * start and exclusive of the end, expressed as UTC hours for the MVP (a real
 * deployment converts using the client's timezone). Supports overnight windows
 * where start > end (e.g., 21 → 8).
 */
export function isQuietHour(now: Date, startHour: number, endHour: number): boolean {
  const h = now.getUTCHours();
  if (startHour === endHour) return false; // no quiet window
  if (startHour < endHour) return h >= startHour && h < endHour;
  // Overnight window (e.g., 21..24 and 0..8)
  return h >= startHour || h < endHour;
}

/** The next instant at/after `now` that is NOT within quiet hours. */
export function nextAllowedTime(now: Date, startHour: number, endHour: number): Date {
  if (!isQuietHour(now, startHour, endHour)) return now;
  const d = new Date(now);
  // Advance to the configured end hour (today or tomorrow).
  d.setUTCMinutes(0, 0, 0);
  while (isQuietHour(d, startHour, endHour)) {
    d.setUTCHours(d.getUTCHours() + 1);
  }
  return d;
}
