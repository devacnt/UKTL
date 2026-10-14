import type { AppEnv } from "./env";
export type SwipeAction = "interested" | "dismissed";
export type SwipeCursor = { at: number; candidateId: string; jobId: string };
export type SwipeHistoryEntry = {
  candidate_id: string; job_id: string; action: SwipeAction; swiped_at: number;
  title: string; company: string | null; location: string | null; status: string;
  source: string | null; source_url: string | null; expiry_date: string | null;
};
/** Ownership and job status are checked in the same statement as the write. */
export async function saveCandidateDecision(env: AppEnv, userId: string, candidateId: string, jobId: string, action: SwipeAction) {
  const row = await env.DB.prepare(`INSERT INTO candidate_swipes (candidate_id,job_id,action,swiped_at)
    SELECT c.id,j.id,?,? FROM candidates c JOIN jobs j ON j.id=?
    WHERE c.id=? AND c.auth_user_id=? AND j.status='open' AND (j.expiry_date IS NULL OR j.expiry_date >= CAST(CURRENT_DATE AS TEXT))
    ON CONFLICT(candidate_id,job_id) DO UPDATE SET action=excluded.action,
    swiped_at=CASE WHEN candidate_swipes.swiped_at >= excluded.swiped_at THEN candidate_swipes.swiped_at+1 ELSE excluded.swiped_at END
    RETURNING swiped_at`).bind(action,Date.now(),jobId,candidateId,userId).first<{swiped_at:number}>();
  if (!row) throw new Error("This role is no longer open or the profile is unavailable");
  return { swipedAt: Number(row.swiped_at) };
}
/** Conditional undo must never erase a newer decision made in another tab. */
export async function undoCandidateDecision(env: AppEnv, userId: string, candidateId: string, jobId: string, swipedAt: number) {
  const row = await env.DB.prepare(`DELETE FROM candidate_swipes WHERE candidate_id=? AND job_id=? AND swiped_at=?
    AND EXISTS (SELECT 1 FROM candidates c WHERE c.id=candidate_swipes.candidate_id AND c.auth_user_id=?)
    RETURNING job_id`).bind(candidateId,jobId,swipedAt,userId).first<{job_id:string}>();
  if (!row) throw new Error("This decision has changed. Refresh your history before trying again.");
}
export async function listCandidateDecisions(env: AppEnv, userId: string, cursor?: SwipeCursor) {
  const args: unknown[] = [userId];
  let after = "";
  if (cursor) {
    after = " AND (s.swiped_at < ? OR (s.swiped_at = ? AND (s.candidate_id > ? OR (s.candidate_id = ? AND s.job_id > ?))))";
    args.push(cursor.at,cursor.at,cursor.candidateId,cursor.candidateId,cursor.jobId);
  }
  const result = await env.DB.prepare(`SELECT s.*,j.title,j.company,j.location,j.status,j.source,j.source_url,j.expiry_date
    FROM candidate_swipes s JOIN candidates c ON c.id=s.candidate_id JOIN jobs j ON j.id=s.job_id
    WHERE c.auth_user_id=?${after} ORDER BY s.swiped_at DESC,s.candidate_id ASC,s.job_id ASC LIMIT 51`).bind(...args).all<SwipeHistoryEntry>();
  const rows = (result.results ?? []).map(r=>({...r,swiped_at:Number(r.swiped_at)}));
  const items = rows.slice(0,50); const last = items.at(-1);
  return { items, nextCursor: rows.length > 50 && last ? {at:last.swiped_at,candidateId:last.candidate_id,jobId:last.job_id} : null };
}
export async function listJobInterests(env: AppEnv, jobId: string) {
  const result = await env.DB.prepare(`SELECT s.candidate_id,c.name,c.headline,s.swiped_at
    FROM candidate_swipes s JOIN candidates c ON c.id=s.candidate_id
    WHERE s.job_id=? AND s.action='interested' ORDER BY s.swiped_at DESC,s.candidate_id ASC`).bind(jobId)
    .all<{candidate_id:string;name:string|null;headline:string|null;swiped_at:number}>();
  return (result.results ?? []).map(r=>({...r,swiped_at:Number(r.swiped_at)}));
}
