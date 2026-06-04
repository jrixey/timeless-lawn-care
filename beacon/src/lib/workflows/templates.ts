import type { WorkflowType } from "@/lib/domain/types";

export interface CadenceStep {
  /** Delay from enrollment (or previous step) before sending, in minutes. */
  delayMinutes: number;
  body: string;
}

export interface WorkflowConfig {
  instantTextback: { body: string };
  leadFollowup: { steps: CadenceStep[] };
  reviewRequest: { delayMinutes: number; body: string };
}

/** Sensible HVAC defaults; per-client overrides live in `workflows.config`. */
export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  instantTextback: {
    body: "Hi {name}, this is {client} — sorry we missed you! How can we help with your heating or cooling today?",
  },
  leadFollowup: {
    steps: [
      { delayMinutes: 60, body: "Hi {name}, just following up from {client}. Still want us to take a look? Reply here and we'll get you scheduled." },
      { delayMinutes: 1440, body: "{client} here again — we'd love to help with your HVAC. Want the next available appointment?" },
      { delayMinutes: 4320, body: "Last check-in from {client} — reply anytime and we'll get a technician out. Reply STOP to opt out." },
    ],
  },
  reviewRequest: {
    delayMinutes: 120,
    body: "Thanks for choosing {client}, {name}! If you have a moment, we'd really appreciate a quick review: {reviewLink}",
  },
};

export function renderTemplate(
  body: string,
  vars: { name?: string | null; client?: string; reviewLink?: string | null },
): string {
  return body
    .replace(/\{name\}/g, vars.name?.trim() || "there")
    .replace(/\{client\}/g, vars.client ?? "our team")
    .replace(/\{reviewLink\}/g, vars.reviewLink ?? "");
}

export function defaultConfigFor(type: WorkflowType): Record<string, unknown> {
  switch (type) {
    case "instant_textback":
      return DEFAULT_WORKFLOW_CONFIG.instantTextback;
    case "lead_followup":
      return DEFAULT_WORKFLOW_CONFIG.leadFollowup;
    case "review_request":
      return DEFAULT_WORKFLOW_CONFIG.reviewRequest;
  }
}
