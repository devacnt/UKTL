import type { AppEnv } from "./env";
import { sendNotificationEmail } from "./notify.ts";
import type { OutreachTemplate } from "../outreach-templates.ts";

// ── CSV export ───────────────────────────────────────────────────────────────

/**
 * RFC 4180 CSV. Every field is quoted, and any cell a spreadsheet would treat
 * as a formula (= + - @, tab, CR) is prefixed with an apostrophe so exported
 * candidate text can never execute in Excel/Sheets (CSV injection).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let text = typeof value === "string" ? value : String(value);
  if (/^[\s]*[=+\-@]|^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]) {
  const lines = [columns.map((c) => csvCell(c.label)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c.key])).join(","));
  // BOM so Excel opens UTF-8 names correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

const iso = (ms: unknown) => (ms == null || ms === "" ? "" : new Date(Number(ms)).toISOString());

export const EXPORTS = {
  candidates: {
    label: "Candidates",
    columns: [
      ["id", "Candidate ID"], ["name", "Name"], ["email", "Email"], ["phone", "Phone"], ["location", "Location"],
      ["headline", "Headline"], ["seniority", "Seniority"], ["total_years_experience", "Years experience"],
      ["quality_score", "CV score"], ["status", "CV status"], ["has_account", "Has account"], ["created", "Uploaded"],
    ],
    sql: `SELECT id,name,email,phone,location,headline,seniority,total_years_experience,quality_score,status,
            CASE WHEN auth_user_id IS NULL THEN 'no' ELSE 'yes' END AS has_account,created_at
            FROM candidates ORDER BY created_at DESC LIMIT 10001`,
  },
  pipeline: {
    label: "Mandate pipeline",
    columns: [
      ["job_title", "Mandate"], ["company", "Company"], ["candidate_id", "Candidate ID"], ["name", "Candidate"],
      ["email", "Email"], ["score", "Match score"], ["stage", "Stage"], ["stage_updated", "Stage updated"],
    ],
    sql: `SELECT j.title AS job_title,j.company,m.candidate_id,c.name,c.email,m.score,m.stage,m.stage_updated_at
            FROM matches m JOIN jobs j ON j.id=m.job_id JOIN candidates c ON c.id=m.candidate_id
           WHERE (? = '' OR m.job_id = ?) ORDER BY j.title,m.score DESC LIMIT 20001`,
  },
  enquiries: {
    label: "Enquiries",
    columns: [
      ["created", "Received"], ["name", "Name"], ["email", "Email"], ["company", "Company"],
      ["enquiry_type", "Type"], ["status", "Status"], ["message", "Message"],
    ],
    sql: `SELECT created_at,name,email,company,enquiry_type,status,message FROM enquiries ORDER BY created_at DESC LIMIT 10001`,
  },
  bookings: {
    label: "Consultations",
    columns: [
      ["starts", "Starts (UTC)"], ["ends", "Ends (UTC)"], ["status", "Status"], ["contact_name", "Name"],
      ["contact_email", "Email"], ["contact_phone", "Phone"], ["topic_area", "Topic"], ["cancelled_by", "Cancelled by"],
      ["source", "Source"], ["created", "Booked"],
    ],
    sql: `SELECT starts_at,ends_at,status,contact_name,contact_email,contact_phone,topic_area,cancelled_by,source,created_at
            FROM bookings ORDER BY COALESCE(starts_at,created_at) DESC LIMIT 10001`,
  },
} as const;
export type ExportKind = keyof typeof EXPORTS;

export async function buildExport(env: AppEnv, kind: ExportKind, actorId: string | null, jobId = "", now = Date.now()) {
  if (env.DATA_BACKEND !== "supabase") throw new Error("Exports require the Supabase backend");
  const spec = EXPORTS[kind];
  const select = env.DB.prepare(spec.sql);
  // Record the export in the same transaction as the read: no unaudited download.
  const [result] = await env.DB.batch([
    kind === "pipeline" ? select.bind(jobId, jobId) : select,
    env.DB.prepare(
      "INSERT INTO audit_events(actor_user_id,actor_kind,action,entity_type,entity_id,metadata) VALUES(?::uuid,'user','export',?,?,jsonb_build_object('job_id',NULLIF(?::text,'')))",
    ).bind(actorId, "csv", kind, jobId),
  ]);
  if ((result.results?.length ?? 0) > (kind === "pipeline" ? 20000 : 10000))
    throw new Error("Export exceeds the row limit. Narrow the scope or request a managed export.");
  const rows = ((result.results ?? []) as Record<string, unknown>[]).map((r) => ({
    ...r,
    created: iso(r.created_at),
    starts: iso(r.starts_at),
    ends: iso(r.ends_at),
    stage_updated: iso(r.stage_updated_at),
  }));
  const csv = toCsv(spec.columns.map(([key, label]) => ({ key, label })), rows);
  if (new TextEncoder().encode(csv).length > 10 * 1024 * 1024)
    throw new Error("Export exceeds the file-size limit. Request a managed export.");
  const stamp = new Date(now).toISOString().slice(0, 10);
  return { csv, rows: rows.length, filename: `uktl-${kind}${jobId ? "-" + jobId.replace(/[^\w-]/g, "") : ""}-${stamp}.csv` };
}

// ── Analytics charts ─────────────────────────────────────────────────────────

export const WEEK = 604800000;
/** Epoch 0 was a Thursday; shifting 3 days aligns buckets to Monday 00:00 UTC. */
export const WEEK_SHIFT = 259200000;
export const weekStart = (ms: number) => Math.floor((ms + WEEK_SHIFT) / WEEK) * WEEK - WEEK_SHIFT;

export async function chartData(env: AppEnv, now = Date.now(), weeks = 12) {
  const from = weekStart(now) - (weeks - 1) * WEEK;
  const bucket = (col: string) => `(${col}+${WEEK_SHIFT})/${WEEK}`;
  const [cands, questions, bookings, status, quality, stages] = await env.DB.batch([
    env.DB.prepare(`SELECT ${bucket("created_at")} AS w, COUNT(*) AS n FROM candidates WHERE created_at>=? GROUP BY 1`).bind(from),
    env.DB.prepare(`SELECT ${bucket("created_at")} AS w, COUNT(*) AS n FROM hr_queries WHERE created_at>=? GROUP BY 1`).bind(from),
    env.DB.prepare(`SELECT ${bucket("created_at")} AS w, COUNT(*) AS n FROM bookings WHERE created_at>=? GROUP BY 1`).bind(from),
    env.DB.prepare(`SELECT status AS k, COUNT(*) AS n FROM candidates GROUP BY status`),
    env.DB.prepare(
      `SELECT CASE WHEN quality_score<40 THEN '0–39' WHEN quality_score<60 THEN '40–59' WHEN quality_score<80 THEN '60–79' ELSE '80–100' END AS k, COUNT(*) AS n
         FROM candidates WHERE quality_score IS NOT NULL GROUP BY 1`,
    ),
    env.DB.prepare(`SELECT stage AS k, COUNT(*) AS n FROM matches GROUP BY stage`),
  ]);
  const byWeek = (r: { results?: unknown[] }) =>
    new Map(((r.results ?? []) as { w: number; n: number }[]).map((x) => [Number(x.w), Number(x.n)]));
  const c = byWeek(cands), q = byWeek(questions), b = byWeek(bookings);
  const series = Array.from({ length: weeks }, (_, i) => {
    const start = from + i * WEEK;
    const key = (start + WEEK_SHIFT) / WEEK;
    return { week: start, candidates: c.get(key) ?? 0, questions: q.get(key) ?? 0, bookings: b.get(key) ?? 0 };
  });
  const counts = (r: { results?: unknown[] }) =>
    Object.fromEntries(((r.results ?? []) as { k: string; n: number }[]).map((x) => [String(x.k), Number(x.n)]));
  return { series, status: counts(status), quality: counts(quality), stages: counts(stages) };
}

// ── Candidate outreach ───────────────────────────────────────────────────────

export type OutreachInput = {
  candidateId: string;
  jobId?: string | null;
  template: OutreachTemplate;
  subject: string;
  body: string;
  sentBy: string;
  replyTo?: string | null;
};

const FOOTER =
  "\n\n—\nYou are receiving this because you registered with, or sent your CV to, UK Talent Link. " +
  "Reply to this email to reach your consultant, or ask us to stop contacting you.";

/** The account email once verified by Supabase Auth; otherwise the CV email. */
export async function outreachRecipient(env: AppEnv, candidateId: string) {
  const row = await env.DB.prepare(
    `SELECT c.name,c.email,u.email AS account_email FROM candidates c
       LEFT JOIN auth_accounts u ON u.id=c.auth_user_id AND u.email_confirmed_at IS NOT NULL
      WHERE c.id=?`,
  )
    .bind(candidateId)
    .first<{ name: string | null; email: string | null; account_email: string | null }>();
  if (!row) throw new Error("Candidate not found");
  const email = (row.account_email || row.email || "").trim().toLowerCase();
  const valid = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/.test(email) && email.length <= 320;
  return {
    name: row.name,
    email: valid ? email : null,
    source: row.account_email ? ("account" as const) : row.email ? ("cv" as const) : null,
  };
}

export async function sendCandidateMessage(env: AppEnv, input: OutreachInput, now = Date.now()) {
  if (env.DATA_BACKEND !== "supabase") throw new Error("Candidate email requires the Supabase backend");
  const recipient = await outreachRecipient(env, input.candidateId);
  if (!recipient.email) throw new Error("This candidate has no valid email address on file");
  const id = crypto.randomUUID();
  // Refuses an identical message to the same candidate within 10 minutes (double submit).
  const [, created] = await env.DB.batch([
    // A separate statement after this lock gets a fresh READ COMMITTED snapshot.
    // Concurrent identical sends cannot both pass the NOT EXISTS check.
    env.DB.prepare("SELECT pg_advisory_xact_lock(hashtextextended(?,74143))").bind(input.candidateId),
    env.DB.prepare(
    `INSERT INTO candidate_messages(id,candidate_id,job_id,sent_by,template,to_email,subject,body,status,created_at,updated_at)
     SELECT ?::uuid,?,?,?::uuid,?,?,?,?,'sending',?,?
      WHERE NOT EXISTS(SELECT 1 FROM candidate_messages WHERE candidate_id=? AND subject=? AND body=? AND created_at>?)
     RETURNING id`,
  )
    .bind(id, input.candidateId, input.jobId || null, input.sentBy, input.template, recipient.email, input.subject, input.body, now, now,
      input.candidateId, input.subject, input.body, now - 600000)
  ]);
  if (!created.results?.length) throw new Error("This message was already sent in the last 10 minutes");
  const outcome = await sendNotificationEmail(
    env,
    { to: [recipient.email], subject: input.subject, text: input.body + FOOTER, replyTo: input.replyTo || null },
    `uktl-msg-${id}`,
  );
  await env.DB.prepare("UPDATE candidate_messages SET status=?,error=?,updated_at=? WHERE id=?::uuid")
    .bind(outcome.status, outcome.status === "sent" ? null : outcome.reason, Date.now(), id)
    .run();
  return { id, status: outcome.status, reason: outcome.status === "sent" ? null : outcome.reason, to: recipient.email };
}

export async function listCandidateMessages(env: AppEnv, candidateId: string) {
  if (env.DATA_BACKEND !== "supabase") return [];
  const rows = await env.DB.prepare(
    `SELECT m.id,m.template,m.subject,m.body,m.to_email,m.status,m.error,m.created_at,j.title AS job_title
       FROM candidate_messages m LEFT JOIN jobs j ON j.id=m.job_id
      WHERE m.candidate_id=? ORDER BY m.created_at DESC LIMIT 50`,
  )
    .bind(candidateId)
    .all<{ id: string; template: string; subject: string; body: string; to_email: string; status: string; error: string | null; created_at: number; job_title: string | null }>();
  return (rows.results ?? []).map((r) => ({ ...r, created_at: Number(r.created_at) }));
}
