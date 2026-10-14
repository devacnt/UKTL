import type { AppEnv } from "./env";
import { finishFileDeletion } from "./operations.ts";
type AuthDeletion = { deleteUser: (id: string) => Promise<{ error: { status?: number } | null }> };
export async function completeAccountErasure(
  env: AppEnv,
  requestId: string,
  actorId: string,
  reviewComplete: boolean,
  auth: AuthDeletion,
) {
  if (env.DATA_BACKEND !== "supabase" || reviewComplete !== true)
    throw new Error("Reviewed Supabase account removal required");
  await env.DB.prepare("SELECT recruitment.begin_account_erasure(?::uuid,?::uuid,?)")
    .bind(requestId, actorId, reviewComplete)
    .run();
  const job = await env.DB.prepare(
    "SELECT target_user_id,file_deletion_ids,status FROM account_erasures WHERE request_id=?::uuid",
  )
    .bind(requestId)
    .first<{ target_user_id: string | null; file_deletion_ids: string[]; status: string }>();
  if (!job) throw new Error("Erasure unavailable");
  if (job.status === "completed") return { status: "completed" as const };
  if (
    !job.target_user_id ||
    !Array.isArray(job.file_deletion_ids) ||
    job.file_deletion_ids.length > 1000
  )
    throw new Error("Erasure requires manual review");
  try {
    for (const id of job.file_deletion_ids) await finishFileDeletion(env, id);
    // A missing user on retry means Auth removal previously succeeded; all other
    // provider failures leave this durable job pending and access blocked.
    const { error } = await auth.deleteUser(job.target_user_id);
    if (error && error.status !== 404) throw new Error();
    // A 404 from a misconfigured Auth project must never count as erasure.
    const stillExists = await env.DB.prepare("SELECT id FROM auth_accounts WHERE id=?::uuid").bind(job.target_user_id).first();
    if (stillExists) throw new Error();
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE privacy_requests SET status='completed',user_id=NULL,updated_at=?,resolution='Reviewed account data and private files removed. External records were handled in the administrator review.' WHERE id=?::uuid",
      ).bind(Date.now(), requestId),
      env.DB.prepare(
        "UPDATE account_erasures SET status='completed',target_user_id=NULL,file_deletion_ids='[]'::jsonb,completed_at=? WHERE request_id=?::uuid",
      ).bind(Date.now(), requestId),
    ]);
    return { status: "completed" as const };
  } catch {
    return { status: "pending" as const };
  }
}
