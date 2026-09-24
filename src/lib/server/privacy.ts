import type { AppEnv } from "./env";
export const PRIVACY_NOTICE_VERSION = "2026-09-23";
export async function requestPrivacyAction(
  env: AppEnv,
  userId: string,
  kind: "export" | "erasure",
) {
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO privacy_requests(user_id,kind,created_at,updated_at) VALUES (?::uuid,?,?,?)
 ON CONFLICT(user_id,kind) WHERE status IN ('pending','reviewing') DO UPDATE SET user_id=excluded.user_id RETURNING id,status,created_at`,
  )
    .bind(userId, kind, now, now)
    .first();
  if (!row) throw new Error("Privacy request could not be saved");
  return row;
}
export async function exportOwnData(env: AppEnv, userId: string) {
  if (env.DATA_BACKEND !== "supabase") throw new Error("Data export requires Supabase");
  const own = `SELECT id FROM recruitment.candidates WHERE auth_user_id=?::uuid`;
  const queries = [
    ["profile", "SELECT to_jsonb(p) AS record FROM public.profiles p WHERE id=?::uuid"],
    [
      "candidates",
      `SELECT to_jsonb(c)-'source_r2_key' AS record FROM candidates c WHERE auth_user_id=?::uuid LIMIT 1001`,
    ],
    ...[
      "candidate_skills",
      "candidate_experience",
      "candidate_education",
      "matches",
      "candidate_swipes",
      "candidate_consents",
    ].map((t) => [
      t,
      `SELECT to_jsonb(r) AS record FROM ${t} r WHERE candidate_id IN (${own}) LIMIT 1001`,
    ]),
    [
      "hr_queries",
      "SELECT to_jsonb(q) AS record FROM hr_queries q WHERE auth_user_id=?::uuid LIMIT 1001",
    ],
    [
      "bookings",
      "SELECT to_jsonb(b)-'provider_invitee_uri'-'provider_event_uri' AS record FROM bookings b WHERE auth_user_id=?::uuid LIMIT 1001",
    ],
    ["messages", `SELECT m.id,m.subject,m.body,m.created_at,m.read_at FROM candidate_messages m WHERE m.candidate_id IN (${own}) AND m.status='sent' LIMIT 1001`],
    ["communication_preferences", "SELECT campaigns_enabled,updated_at FROM communication_preferences WHERE user_id=?::uuid"],
    [
      "privacy_requests",
      "SELECT id,kind,status,created_at,updated_at,resolution FROM privacy_requests WHERE user_id=?::uuid LIMIT 1001",
    ],
  ];
  const results = await env.DB.batch(queries.map(([, sql]) => env.DB.prepare(sql).bind(userId)));
  if (results.some((r) => !r.success || !r.results || r.results.length > 1000))
    throw new Error(
      "Export requires staff assistance. Submit an export request from your profile.",
    );
  const data = Object.fromEntries(
    queries.map(([name], i) => [
      name,
      results[i].results!.map((r) => {
        const row = r as Record<string, unknown>;
        return row.record ?? row;
      }),
    ]),
  );
  const result = {
    generatedAt: new Date().toISOString(),
    noticeVersion: PRIVACY_NOTICE_VERSION,
    scope:
      "Self-service account and recruitment data. Download original CVs from your CV page. Internal notes, third-party records and additional personal data require a reviewed export request.",
    data,
  };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 10 * 1024 * 1024)
    throw new Error("Export requires staff assistance. Submit an export request.");
  return result;
}
