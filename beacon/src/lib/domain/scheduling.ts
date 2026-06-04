import type { TenantDb } from "@/lib/db/tenant";
import type { Appointment, Review } from "./types.js";

export interface CreateAppointmentInput {
  agencyId: string;
  clientId: string;
  contactId: string;
  title?: string;
  startsAt: string;
  endsAt: string;
  location?: string | null;
  notes?: string | null;
  calendarEventId?: string | null;
}

export async function createAppointment(
  db: TenantDb,
  input: CreateAppointmentInput,
): Promise<Appointment> {
  const { rows } = await db.query<Appointment>(
    `INSERT INTO appointments
       (agency_id, client_id, contact_id, title, starts_at, ends_at, location, notes, calendar_event_id)
     VALUES ($1,$2,$3,COALESCE($4,'Service appointment'),$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      input.agencyId,
      input.clientId,
      input.contactId,
      input.title ?? null,
      input.startsAt,
      input.endsAt,
      input.location ?? null,
      input.notes ?? null,
      input.calendarEventId ?? null,
    ],
  );
  return rows[0]!;
}

export async function listAppointments(db: TenantDb, clientId?: string): Promise<Appointment[]> {
  const params: unknown[] = [];
  let filter = "";
  if (clientId) {
    params.push(clientId);
    filter = "WHERE client_id = $1";
  }
  const { rows } = await db.query<Appointment>(
    `SELECT * FROM appointments ${filter} ORDER BY starts_at ASC`,
    params,
  );
  return rows;
}

export async function setAppointmentStatus(
  db: TenantDb,
  id: string,
  status: Appointment["status"],
): Promise<void> {
  await db.query("UPDATE appointments SET status = $2 WHERE id = $1", [id, status]);
}

// ── Reviews ──────────────────────────────────────────────────────────────────
export async function createReview(
  db: TenantDb,
  input: {
    agencyId: string;
    clientId: string;
    contactId: string;
    appointmentId?: string | null;
    reviewLink?: string | null;
    status?: Review["status"];
  },
): Promise<Review> {
  const { rows } = await db.query<Review>(
    `INSERT INTO reviews (agency_id, client_id, contact_id, appointment_id, review_link, status)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6,'pending')) RETURNING *`,
    [
      input.agencyId,
      input.clientId,
      input.contactId,
      input.appointmentId ?? null,
      input.reviewLink ?? null,
      input.status ?? null,
    ],
  );
  return rows[0]!;
}

export async function markReviewRequested(db: TenantDb, id: string): Promise<void> {
  await db.query(
    "UPDATE reviews SET status = 'requested', requested_at = now() WHERE id = $1",
    [id],
  );
}

export async function listReviews(db: TenantDb, clientId?: string): Promise<Review[]> {
  const params: unknown[] = [];
  let filter = "";
  if (clientId) {
    params.push(clientId);
    filter = "WHERE client_id = $1";
  }
  const { rows } = await db.query<Review>(
    `SELECT * FROM reviews ${filter} ORDER BY created_at DESC`,
    params,
  );
  return rows;
}
