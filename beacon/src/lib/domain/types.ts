/** Row types mirroring the schema. All ids are UUID strings; times are ISO. */

export type Role = "agency_admin" | "agency_member" | "client_admin" | "client_member";

export interface Agency {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  agency_id: string;
  client_id: string | null;
  email: string;
  name: string;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  agency_id: string;
  name: string;
  slug: string;
  industry: string;
  phone: string | null;
  timezone: string;
  business_hours: BusinessHours;
  ai_config: AiConfig;
  review_link: string | null;
  status: "active" | "paused" | "archived";
  created_at: string;
  updated_at: string;
}

export interface BusinessHours {
  /** 0=Sun..6=Sat → [openHour, closeHour) in the client's local time, or null = closed. */
  [day: string]: [number, number] | null;
}

export interface AiConfig {
  greeting?: string;
  services?: string[];
  pricing?: string;
  hoursSummary?: string;
  tone?: "friendly" | "professional" | "casual";
  bookingWindowDays?: number;
  appointmentMinutes?: number;
}

export type ContactStage = "new" | "contacted" | "qualified" | "booked" | "won" | "lost";
export type ContactSource =
  | "web_form"
  | "missed_call"
  | "inbound_call"
  | "inbound_sms"
  | "manual"
  | "import";

export interface Contact {
  id: string;
  agency_id: string;
  client_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: ContactSource;
  stage: ContactStage;
  tags: string[];
  opted_out: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type Channel = "sms" | "voice" | "email";

export interface Conversation {
  id: string;
  agency_id: string;
  client_id: string;
  contact_id: string;
  channel: Channel;
  status: "open" | "snoozed" | "closed";
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  agency_id: string;
  client_id: string;
  conversation_id: string;
  contact_id: string;
  direction: "inbound" | "outbound";
  channel: Channel;
  body: string;
  status: "queued" | "sent" | "delivered" | "failed" | "received";
  automated: boolean;
  provider_message_id: string | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  agency_id: string;
  client_id: string;
  contact_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: "proposed" | "booked" | "canceled" | "completed" | "no_show";
  location: string | null;
  notes: string | null;
  calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  agency_id: string;
  client_id: string;
  contact_id: string;
  appointment_id: string | null;
  status: "pending" | "requested" | "completed" | "declined";
  rating: number | null;
  review_link: string | null;
  requested_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkflowType = "instant_textback" | "lead_followup" | "review_request";

export interface Workflow {
  id: string;
  agency_id: string;
  client_id: string;
  type: WorkflowType;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRun {
  id: string;
  agency_id: string;
  client_id: string;
  workflow_id: string;
  contact_id: string;
  status: "active" | "completed" | "canceled";
  current_step: number;
  context: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
  canceled_at: string | null;
}

export interface Job {
  id: string;
  agency_id: string;
  client_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  run_at: string;
  status: "pending" | "running" | "done" | "failed" | "canceled";
  attempts: number;
  max_attempts: number;
  dedupe_key: string | null;
  last_error: string | null;
}
