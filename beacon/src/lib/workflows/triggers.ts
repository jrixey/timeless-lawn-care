import type { TenantDb } from "@/lib/db/tenant";
import type { Contact } from "@/lib/domain/types";
import { setOptOut, setContactStage } from "@/lib/domain/contacts";
import {
  upsertWorkflow,
  enrollRun,
  getWorkflow,
  cancelRunsForContact,
} from "@/lib/domain/workflows";
import { createReview } from "@/lib/domain/scheduling";
import { enqueueJob, cancelPendingJobsForContact } from "@/lib/queue/enqueue";
import { isStopKeyword, isStartKeyword, OPT_OUT_CONFIRMATION, OPT_IN_CONFIRMATION } from "./opt-out.js";
import {
  DEFAULT_WORKFLOW_CONFIG,
  defaultConfigFor,
  type CadenceStep,
} from "./templates.js";

const AUTOMATION_JOB_TYPES = ["instant_textback", "followup_step", "review_request", "send_sms"];

/**
 * A new lead arrived (missed call or web form). Fire instant text-back now and
 * enroll the contact in the follow-up cadence. Idempotent: dedupe keys prevent
 * double-sends if the trigger fires twice for the same lead.
 */
export async function triggerNewLead(
  db: TenantDb,
  args: { agencyId: string; clientId: string; contact: Contact; conversationId?: string },
): Promise<void> {
  const { agencyId, clientId, contact } = args;
  if (contact.opted_out) return;

  // 1) Instant text-back (immediate).
  await enqueueJob(db, {
    agencyId,
    clientId,
    type: "instant_textback",
    payload: { contactId: contact.id, conversationId: args.conversationId ?? null },
    dedupeKey: `instant:${contact.id}`,
  });

  // 2) Follow-up cadence — ensure the workflow exists, enroll, schedule step 0.
  let wf = await getWorkflow(db, clientId, "lead_followup");
  if (!wf) {
    wf = await upsertWorkflow(db, {
      agencyId,
      clientId,
      type: "lead_followup",
      config: defaultConfigFor("lead_followup"),
    });
  }
  if (!wf.enabled) return;

  const run = await enrollRun(db, {
    agencyId,
    clientId,
    workflowId: wf.id,
    contactId: contact.id,
  });
  const steps: CadenceStep[] =
    (wf.config as { steps?: CadenceStep[] }).steps ?? DEFAULT_WORKFLOW_CONFIG.leadFollowup.steps;
  const first = steps[0];
  if (first) {
    await enqueueJob(db, {
      agencyId,
      clientId,
      type: "followup_step",
      payload: { workflowRunId: run.id, contactId: contact.id, stepIndex: 0 },
      runAt: new Date(Date.now() + first.delayMinutes * 60 * 1000),
      dedupeKey: `followup:${run.id}:0`,
    });
  }
}

/**
 * An inbound message from the contact. Handle STOP/START, and otherwise treat
 * any reply as engagement: cancel the follow-up cadence so we stop nagging.
 */
export async function triggerInboundReply(
  db: TenantDb,
  args: { agencyId: string; clientId: string; contact: Contact; conversationId: string; body: string },
): Promise<{ optedOut?: boolean; optedIn?: boolean; engaged?: boolean }> {
  const { agencyId, clientId, contact, body } = args;

  if (isStopKeyword(body)) {
    await setOptOut(db, contact.id, true);
    await cancelPendingJobsForContact(db, clientId, contact.id, AUTOMATION_JOB_TYPES);
    await cancelRunsForContact(db, contact.id);
    // Opt-out confirmation is permitted even after STOP.
    await enqueueJob(db, {
      agencyId,
      clientId,
      type: "send_sms",
      payload: {
        contactId: contact.id,
        conversationId: args.conversationId,
        body: OPT_OUT_CONFIRMATION,
        bypassOptOut: true,
        automated: true,
      },
      dedupeKey: `optout-confirm:${contact.id}`,
    });
    return { optedOut: true };
  }

  if (isStartKeyword(body)) {
    await setOptOut(db, contact.id, false);
    await enqueueJob(db, {
      agencyId,
      clientId,
      type: "send_sms",
      payload: {
        contactId: contact.id,
        conversationId: args.conversationId,
        body: OPT_IN_CONFIRMATION,
        bypassOptOut: true,
        automated: true,
      },
      dedupeKey: `optin-confirm:${contact.id}`,
    });
    return { optedIn: true };
  }

  // Engagement: stop the cadence and advance the pipeline stage.
  await cancelRunsForContact(db, contact.id, ["lead_followup"]);
  await cancelPendingJobsForContact(db, clientId, contact.id, ["followup_step"]);
  if (contact.stage === "new") await setContactStage(db, contact.id, "contacted");
  return { engaged: true };
}

/** A booking was made — move pipeline forward and stop nagging follow-ups. */
export async function triggerAppointmentBooked(
  db: TenantDb,
  args: { clientId: string; contactId: string },
): Promise<void> {
  await setContactStage(db, args.contactId, "booked");
  await cancelRunsForContact(db, args.contactId, ["lead_followup"]);
  await cancelPendingJobsForContact(db, args.clientId, args.contactId, ["followup_step"]);
}

/** Job complete → request a review after a short delay. Idempotent per appointment. */
export async function triggerReviewRequest(
  db: TenantDb,
  args: {
    agencyId: string;
    clientId: string;
    contactId: string;
    appointmentId: string;
    reviewLink?: string | null;
  },
): Promise<void> {
  const review = await createReview(db, {
    agencyId: args.agencyId,
    clientId: args.clientId,
    contactId: args.contactId,
    appointmentId: args.appointmentId,
    reviewLink: args.reviewLink ?? null,
  });
  const cfg = DEFAULT_WORKFLOW_CONFIG.reviewRequest;
  await enqueueJob(db, {
    agencyId: args.agencyId,
    clientId: args.clientId,
    type: "review_request",
    payload: { contactId: args.contactId, reviewId: review.id, appointmentId: args.appointmentId },
    runAt: new Date(Date.now() + cfg.delayMinutes * 60 * 1000),
    dedupeKey: `review:${args.appointmentId}`,
  });
}
