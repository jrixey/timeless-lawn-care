/** STOP / opt-out keyword handling (TCPA compliance). */

const STOP = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|optout|opt-out)\s*$/i;
const START = /^\s*(start|unstop|yes\s*subscribe|resume)\s*$/i;

export function isStopKeyword(body: string): boolean {
  return STOP.test(body);
}
export function isStartKeyword(body: string): boolean {
  return START.test(body);
}

export const OPT_OUT_CONFIRMATION =
  "You're unsubscribed and won't receive further automated messages. Reply START to opt back in.";
export const OPT_IN_CONFIRMATION =
  "You're opted back in and will receive messages again. Reply STOP to unsubscribe.";
