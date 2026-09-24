import type { AppEnv } from "./env";
import { sendNotificationEmail, type Email, type NotificationOutcome } from "./notify.ts";
import { getConsultation, formatLondonRange } from "./calendar.ts";

export const CAMPAIGN_LIMIT = 500;
export const eligibleRecipientsSql = `SELECT DISTINCT ON(c.auth_user_id) c.id,c.auth_user_id,u.email,c.name
 FROM candidates c JOIN auth.users u ON u.id=c.auth_user_id
 JOIN communication_preferences p ON p.user_id=c.auth_user_id AND p.campaigns_enabled=true
 WHERE u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL AND c.status='parsed'
 AND (?='' OR c.id IN(SELECT candidate_id FROM matches m JOIN jobs j ON j.id=m.job_id WHERE j.sector=?))
 ORDER BY c.auth_user_id,c.created_at DESC,c.id DESC LIMIT 501`;
export async function campaignRecipients(env: AppEnv, sector: string) {
  const r = await env.DB.prepare(eligibleRecipientsSql)
    .bind(sector, sector)
    .all<{ id: string; auth_user_id: string; email: string; name: string | null }>();
  return r.results ?? [];
}
export async function audienceFingerprint(
  rows: { id: string; auth_user_id: string; email: string }[],
) {
  const bytes = new TextEncoder().encode(
    JSON.stringify(rows.map((r) => [r.id, r.auth_user_id, r.email.toLowerCase()])),
  );
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function scheduleCampaign(
  env: AppEnv,
  id: string,
  fingerprint: string,
  scheduledAt: number,
  now = Date.now(),
) {
  if (!env.RESEND_API_KEY || !env.SITE_URL?.startsWith("https://"))
    throw new Error("Email provider and HTTPS site URL must be configured before scheduling");
  // Lock the campaign in a single transaction, then freeze the reviewed audience.
  // A SQL function is unnecessary: DB.batch keeps the row lock through every write.
  const campaign = await env.DB.prepare(
    "SELECT sector FROM email_campaigns WHERE id=?::uuid AND status='draft'",
  )
    .bind(id)
    .first<{ sector: string }>();
  if (!campaign) throw new Error("Draft campaign not found");
  const rows = await campaignRecipients(env, campaign.sector);
  if (!rows.length || rows.length > CAMPAIGN_LIMIT)
    throw new Error("Choose an audience of 1–500 opted-in candidates");
  if ((await audienceFingerprint(rows)) !== fingerprint)
    throw new Error("The audience changed. Review the preview again");
  const messages = rows.map((r) => ({ ...r, messageId: crypto.randomUUID() }));
  const statements = [
    env.DB.prepare("SELECT id FROM email_campaigns WHERE id=?::uuid FOR UPDATE").bind(id),
    env.DB.prepare(
      "UPDATE email_campaigns SET status='scheduled',scheduled_at=?,approved_at=?,recipient_count=? WHERE id=?::uuid AND status='draft'",
    ).bind(scheduledAt, now, rows.length, id),
  ];
  for (const r of messages) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO candidate_messages(id,candidate_id,recipient_user_id,campaign_id,sent_by,template,to_email,subject,body,status,created_at,updated_at)
   SELECT ?::uuid,?,?::uuid,id,created_by,'custom',?,subject,body,'pending',?,? FROM email_campaigns
   WHERE id=?::uuid AND status='scheduled' AND approved_at=?
   ON CONFLICT DO NOTHING`,
      ).bind(r.messageId, r.id, r.auth_user_id, r.email, now, now, id, now),
    );
    statements.push(
      env.DB.prepare(
        `INSERT INTO communication_jobs(kind,reference,message_id,due_at)
   SELECT 'campaign',id::text,id,? FROM candidate_messages WHERE id=?::uuid ON CONFLICT DO NOTHING`,
      ).bind(scheduledAt, r.messageId),
    );
  }
  await env.DB.batch(statements);
  return { recipients: rows.length };
}

export async function enqueueReminders(env: AppEnv, now = Date.now()) {
  // Two reminders for appointments booked before each reminder's due time.
  await env.DB.prepare(
    `INSERT INTO communication_jobs(kind,reference,booking_id,booking_start,due_at)
  SELECT 'reminder',b.id||':'||b.starts_at||':'||d.offset_ms,b.id,b.starts_at,b.starts_at-d.offset_ms
  FROM bookings b CROSS JOIN (VALUES(86400000::bigint,7200000::bigint),(3600000::bigint,300000::bigint)) d(offset_ms,cutoff_ms)
  WHERE b.source='native' AND b.status='confirmed' AND b.starts_at-d.offset_ms<=?
   AND b.starts_at>?+d.cutoff_ms AND b.created_at<=b.starts_at-d.offset_ms
  ON CONFLICT(kind,reference) DO NOTHING`,
  )
    .bind(now, now)
    .run();
}

export async function deliverNextCommunication(env: AppEnv, now = Date.now()) {
  const job = await env.DB.prepare(
    `UPDATE communication_jobs SET status='sending',attempts=attempts+1,
  attempted_at=?,first_attempt_at=COALESCE(first_attempt_at,?) WHERE id=(SELECT id FROM communication_jobs
  WHERE status IN('pending','failed') AND due_at<=? AND attempts<3
    AND (first_attempt_at IS NULL OR first_attempt_at>?)
  ORDER BY due_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
  )
    .bind(now, now, now, now - 23 * 3600000)
    .first<{
      id: string;
      kind: string;
      message_id: string | null;
      booking_id: string | null;
      booking_start: number;
    }>();
  if (!job) return { status: "idle" as const };
  let outcome: NotificationOutcome = { status: "skipped", reason: "No longer eligible" };
  let email: Email | undefined;
  if (job.kind === "reminder") {
    const booking = await getConsultation(env, job.booking_id!);
    if (
      booking?.status === "confirmed" &&
      booking.starts_at === Number(job.booking_start) &&
      booking.starts_at > now + 300000
    ) {
      email = {
        to: [booking.contact_email],
        subject: "Reminder: your UK Talent Link consultation",
        text: `Hello ${booking.contact_name || "there"},\n\nYour consultation is ${formatLondonRange(booking.starts_at, booking.ends_at)}.\nLocation: ${booking.location || "To be confirmed"}\n\nManage your appointment: ${env.SITE_URL}/app/consultations\n\nUK Talent Link`,
      };
    }
  } else {
    const row = await env.DB.prepare(
      `SELECT m.subject,m.body,m.to_email,p.unsubscribe_token FROM candidate_messages m
   JOIN email_campaigns c ON c.id=m.campaign_id AND c.status='scheduled'
   JOIN communication_preferences p ON p.user_id=m.recipient_user_id AND p.campaigns_enabled=true
   JOIN auth.users u ON u.id=m.recipient_user_id AND u.email_confirmed_at IS NOT NULL AND lower(u.email)=lower(m.to_email)
   WHERE m.id=?::uuid AND m.status IN('pending','failed')`,
    )
      .bind(job.message_id!)
      .first<{ subject: string; body: string; to_email: string; unsubscribe_token: string }>();
    if (row && env.SITE_URL?.startsWith("https://"))
      email = {
        to: [row.to_email],
        subject: row.subject,
        text: `${row.body}\n\n—\nUK Talent Link · You opted in to job updates.\nUnsubscribe: ${env.SITE_URL}/unsubscribe?token=${row.unsubscribe_token}`,
      };
  }
  if (email) outcome = await sendNotificationEmail(env, email, `uktl-communication-${job.id}`);
  const error = outcome.status === "sent" ? null : outcome.reason;
  const statements = [
    env.DB.prepare(
      "UPDATE communication_jobs SET status=?,last_error=?,completed_at=?,due_at=? WHERE id=?::uuid AND status='sending'",
    ).bind(outcome.status, error, outcome.status === "failed" ? null : now, now + 300000, job.id),
  ];
  if (job.message_id)
    statements.push(
      env.DB.prepare(
        "UPDATE candidate_messages SET status=?,error=?,updated_at=? WHERE id=?::uuid",
      ).bind(outcome.status, error, now, job.message_id),
    );
  await env.DB.batch(statements);
  return { status: outcome.status };
}
export async function runCommunications(env: AppEnv) {
  if (env.DATA_BACKEND !== "supabase") throw new Error("Communications require Supabase");
  await enqueueReminders(env);
  const outcomes = [];
  for (let i = 0; i < 10; i++) {
    const r = await deliverNextCommunication(env);
    outcomes.push(r.status);
    if (r.status === "idle") break;
  }
  await env.DB.prepare(
    `UPDATE email_campaigns c SET status='completed' WHERE c.status='scheduled'
  AND NOT EXISTS(SELECT 1 FROM candidate_messages m WHERE m.campaign_id=c.id AND m.status IN('pending','sending','failed'))`,
  ).run();
  return { outcomes };
}
