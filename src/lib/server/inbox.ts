import type { AppEnv } from "./env";

export async function candidateInbox(
  env: AppEnv,
  userId: string,
  before?: { time: number; id: string },
) {
  if (env.DATA_BACKEND !== "supabase") throw new Error("Messages require the Supabase backend");
  const rows = await env.DB.prepare(
    `SELECT m.id,m.subject,m.body,m.created_at,m.read_at,j.title AS job_title
    FROM candidate_messages m JOIN candidates c ON c.id=m.candidate_id LEFT JOIN jobs j ON j.id=m.job_id
    WHERE c.auth_user_id=?::uuid AND m.status='sent'
      AND (?::bigint IS NULL OR (m.created_at,m.id)<(?::bigint,?::uuid))
    ORDER BY m.created_at DESC,m.id DESC LIMIT 51`,
  )
    .bind(userId, before?.time ?? null, before?.time ?? null, before?.id ?? null)
    .all<{
      id: string;
      subject: string;
      body: string;
      created_at: number;
      read_at: number | null;
      job_title: string | null;
    }>();
  const all = (rows.results ?? []).map((r) => ({
    ...r,
    created_at: Number(r.created_at),
    read_at: r.read_at === null ? null : Number(r.read_at),
  }));
  const messages = all.slice(0, 50),
    last = messages.at(-1);
  return {
    messages,
    next: all.length > 50 && last ? { time: last.created_at, id: last.id } : null,
  };
}

export async function markMessageRead(env: AppEnv, userId: string, id: string, now = Date.now()) {
  const row = await env.DB.prepare(
    `UPDATE candidate_messages m SET read_at=COALESCE(read_at,?) FROM candidates c
    WHERE c.id=m.candidate_id AND c.auth_user_id=?::uuid AND m.id=?::uuid AND m.status='sent' RETURNING m.id`,
  )
    .bind(now, userId, id)
    .first();
  if (!row) throw new Error("Message not found");
}
