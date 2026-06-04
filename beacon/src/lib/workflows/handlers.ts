import type { TenantDb } from "@/lib/db/tenant";
import type { Adapters } from "@/lib/adapters";
import type { Job } from "@/lib/domain/types";
import { env } from "@/lib/env";
import { getContact } from "@/lib/domain/contacts";
import { getClient } from "@/lib/domain/clients";
import { getActiveRun, completeRun, advanceRun, getWorkflow } from "@/lib/domain/workflows";
import { markReviewRequested } from "@/lib/domain/scheduling";
import { enqueueJob } from "@/lib/queue/enqueue";
import { deliverSms } from "./deliver.js";
import { isQuietHour, nextAllowedTime } from "./quiet-hours.js";
import { renderTemplate, DEFAULT_WORKFLOW_CONFIG, type CadenceStep } from "./templates.js";

export type JobResult = { status: "done" } | { status: "reschedule"; runAt: Date };

/** Defer automated SMS that would land inside quiet hours. */
function quietHoldUntil(now: Date): Date | null {
  if (!isQuietHour(now, env.quietHours.start, env.quietHours.end)) return null;
  return nextAllowedTime(now, env.quietHours.start, env.quietHours.end);
}

/**
 * Execute one job. Runs inside a tenant-scoped transaction provided by the
 * worker. Returns whether the job is done or should be rescheduled.
 */
export async function handleJob(
  db: TenantDb,
  adapters: Adapters,
  job: Job,
  now: Date,
): Promise<JobResult> {
  switch (job.type) {
    case "instant_textback":
      return handleInstantTextback(db, adapters, job, now);
    case "followup_step":
      return handleFollowupStep(db, adapters, job, now);
    case "review_request":
      return handleReviewRequest(db, adapters, job, now);
    case "send_sms":
      return handleSendSms(db, adapters, job, now);
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

async function loadContactClient(db: TenantDb, job: Job) {
  const contactId = String(job.payload.contactId ?? "");
  const contact = contactId ? await getContact(db, contactId) : null;
  const client = job.client_id ? await getClient(db, job.client_id) : null;
  return { contact, client };
}

async function handleInstantTextback(
  db: TenantDb,
  adapters: Adapters,
  job: Job,
  now: Date,
): Promise<JobResult> {
  const hold = quietHoldUntil(now);
  if (hold) return { status: "reschedule", runAt: hold };
  const { contact, client } = await loadContactClient(db, job);
  if (!contact || !client) return { status: "done" };

  const wf = await getWorkflow(db, client.id, "instant_textback");
  if (wf && !wf.enabled) return { status: "done" };
  const cfg = (wf?.config as { body?: string }) ?? DEFAULT_WORKFLOW_CONFIG.instantTextback;
  const body = renderTemplate(cfg.body ?? DEFAULT_WORKFLOW_CONFIG.instantTextback.body, {
    name: contact.name,
    client: client.name,
  });
  await deliverSms(db, adapters, {
    agencyId: job.agency_id,
    clientId: client.id,
    contact,
    body,
    automated: true,
    idempotencyKey: `job:${job.id}`,
    conversationId: job.payload.conversationId ? String(job.payload.conversationId) : undefined,
  });
  return { status: "done" };
}

async function handleFollowupStep(
  db: TenantDb,
  adapters: Adapters,
  job: Job,
  now: Date,
): Promise<JobResult> {
  const runId = String(job.payload.workflowRunId ?? "");
  const stepIndex = Number(job.payload.stepIndex ?? 0);
  const run = runId ? await getActiveRun(db, runId) : null;
  // Run canceled/completed (contact replied, booked, or opted out) → stop.
  if (!run || run.status !== "active") return { status: "done" };

  const { contact, client } = await loadContactClient(db, job);
  if (!contact || !client) return { status: "done" };
  if (contact.opted_out) {
    await completeRun(db, run.id);
    return { status: "done" };
  }

  const hold = quietHoldUntil(now);
  if (hold) return { status: "reschedule", runAt: hold };

  const wf = await getWorkflow(db, client.id, "lead_followup");
  if (wf && !wf.enabled) {
    await completeRun(db, run.id);
    return { status: "done" };
  }
  const steps: CadenceStep[] =
    (wf?.config as { steps?: CadenceStep[] })?.steps ?? DEFAULT_WORKFLOW_CONFIG.leadFollowup.steps;
  const step = steps[stepIndex];
  if (!step) {
    await completeRun(db, run.id);
    return { status: "done" };
  }

  await deliverSms(db, adapters, {
    agencyId: job.agency_id,
    clientId: client.id,
    contact,
    body: renderTemplate(step.body, { name: contact.name, client: client.name }),
    automated: true,
    idempotencyKey: `job:${job.id}`,
  });
  await advanceRun(db, run.id, stepIndex + 1);

  // Schedule the next step, or complete the run.
  const next = steps[stepIndex + 1];
  if (next) {
    await enqueueJob(db, {
      agencyId: job.agency_id,
      clientId: client.id,
      type: "followup_step",
      payload: { workflowRunId: run.id, contactId: contact.id, stepIndex: stepIndex + 1 },
      runAt: new Date(now.getTime() + next.delayMinutes * 60 * 1000),
      dedupeKey: `followup:${run.id}:${stepIndex + 1}`,
    });
  } else {
    await completeRun(db, run.id);
  }
  return { status: "done" };
}

async function handleReviewRequest(
  db: TenantDb,
  adapters: Adapters,
  job: Job,
  now: Date,
): Promise<JobResult> {
  const hold = quietHoldUntil(now);
  if (hold) return { status: "reschedule", runAt: hold };
  const reviewId = String(job.payload.reviewId ?? "");
  const { contact, client } = await loadContactClient(db, job);
  if (!contact || !client || !reviewId) return { status: "done" };
  if (contact.opted_out) return { status: "done" };

  const wf = await getWorkflow(db, client.id, "review_request");
  if (wf && !wf.enabled) return { status: "done" };
  const cfg = (wf?.config as { body?: string }) ?? DEFAULT_WORKFLOW_CONFIG.reviewRequest;
  const body = renderTemplate(cfg.body ?? DEFAULT_WORKFLOW_CONFIG.reviewRequest.body, {
    name: contact.name,
    client: client.name,
    reviewLink: client.review_link,
  });
  const status = await deliverSms(db, adapters, {
    agencyId: job.agency_id,
    clientId: client.id,
    contact,
    body,
    automated: true,
    idempotencyKey: `job:${job.id}`,
  });
  if (status === "sent") await markReviewRequested(db, reviewId);
  return { status: "done" };
}

async function handleSendSms(
  db: TenantDb,
  adapters: Adapters,
  job: Job,
  now: Date,
): Promise<JobResult> {
  const bypassOptOut = Boolean(job.payload.bypassOptOut);
  const automated = job.payload.automated !== false;
  if (automated && !bypassOptOut) {
    const hold = quietHoldUntil(now);
    if (hold) return { status: "reschedule", runAt: hold };
  }
  const { contact, client } = await loadContactClient(db, job);
  if (!contact || !client) return { status: "done" };
  await deliverSms(db, adapters, {
    agencyId: job.agency_id,
    clientId: client.id,
    contact,
    body: String(job.payload.body ?? ""),
    automated,
    bypassOptOut,
    idempotencyKey: `job:${job.id}`,
    conversationId: job.payload.conversationId ? String(job.payload.conversationId) : undefined,
  });
  return { status: "done" };
}
