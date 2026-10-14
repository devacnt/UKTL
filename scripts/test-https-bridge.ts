import postgres from "postgres";
import assert from "node:assert/strict";
import { createHttpDatabase } from "../src/lib/server/http-database.ts";
import { consumeRateLimit } from "../src/lib/server/ratelimit.ts";
import { createJob, getJob, setMatchStage, listAllJobs } from "../src/lib/server/db.ts";
import { fillJob, rankCandidatesForJob, addToPipeline } from "../src/lib/server/job-tools.ts";
import { outreachRecipient, buildExport } from "../src/lib/server/admin-tools.ts";

// The HTTPS data bridge against a real local Supabase (PostgREST + Postgres):
// the same app code that runs on Lovable/Cloudflare Workers, with no direct
// Postgres connection from the app.
const db = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const api = process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
for (const u of [db, api])
  if (!["127.0.0.1", "localhost"].includes(new URL(u).hostname)) throw new Error("Only isolated local fixtures are permitted");
if (!serviceKey || !anonKey) throw new Error("Set TEST_SUPABASE_SERVICE_ROLE_KEY and TEST_SUPABASE_ANON_KEY from `supabase status`");

const sql = postgres(db, { max: 1, prepare: false });
const tag = crypto.randomUUID().slice(0, 8);
const staff = crypto.randomUUID();
const account = crypto.randomUUID();
const env = { DATA_BACKEND: "supabase", DB: createHttpDatabase(api, serviceKey, staff) } as any;
const profile = (skills: string[]) =>
  JSON.stringify({ skills: skills.map((skill) => ({ skill })), experience: [], education: [], total_years_experience: 6, seniority: "senior", location: "Leeds" });

try {
  await sql`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${staff},${"staff-" + tag + "@example.invalid"},now()),(${account},${"acct-" + tag + "@example.invalid"},now())`;

  // Rate limiting (numbered placeholders reused, INSERT … ON CONFLICT … RETURNING).
  const first = await consumeRateLimit(env, "authAccount", "bridge-" + tag);
  assert.deepEqual(first, { allowed: true, remaining: 19 });
  assert.equal((await consumeRateLimit(env, "authAccount", "bridge-" + tag)).allowed, true);
  assert.equal(Number((await sql`SELECT count FROM recruitment.rate_limits WHERE bucket=${"authAccount:bridge-" + tag}`)[0].count), 2);

  // Types round-trip: bigint as number, jsonb as object, boolean, null, text with quotes/placeholders.
  const tricky = `O'Brien; DROP TABLE recruitment.jobs; -- $1 ? ?1 \\ "q"`;
  const row = await env.DB.prepare("SELECT ?::bigint AS n, ?::jsonb AS j, ?::boolean AS b, ?::text AS t, ?::text AS z")
    .bind(1790000000123, JSON.stringify({ a: [1, "x"] }), true, tricky, null)
    .first();
  assert.deepEqual(row, { n: 1790000000123, j: { a: [1, "x"] }, b: true, t: tricky, z: null });
  assert.ok((await sql`SELECT to_regclass('recruitment.jobs') AS t`)[0].t, "injection text stayed data");

  // Real app flows: mandate, candidates, ranking, pipeline, fill (DB function), outreach view, audited export.
  const now = Date.now();
  await sql`INSERT INTO recruitment.candidates(id,created_at,updated_at,status,name,email,quality_score,raw_profile,auth_user_id) VALUES
    (${"br-a-" + tag},${now},${now},'parsed','Bridge A','cv-a@example.invalid',80,${profile(["SMSTS", "CSCS"])},${account}),
    (${"br-b-" + tag},${now},${now},'parsed','Bridge B',NULL,50,${profile(["SMSTS"])},NULL)`;
  const jobId = "job_br_" + tag;
  await createJob(env, jobId, {
    title: "Bridge Site Manager", company: null, location: "Leeds", sector: "construction", seniority: "senior",
    min_years_experience: 5, description: null, must_have_skills: ["SMSTS", "CSCS"], nice_to_have_skills: [],
    status: "open", posted_date: "2026-01-01", expiry_date: "2099-12-31",
  });
  assert.equal((await getJob(env, jobId))?.title, "Bridge Site Manager");
  const ranking = await rankCandidatesForJob(env, jobId);
  assert.equal(ranking.candidates.find((c) => c.id === "br-a-" + tag)?.qualified, true);
  assert.deepEqual(await addToPipeline(env, jobId, ["br-a-" + tag, "br-b-" + tag]), { added: 2, skipped: 0 });
  assert.equal(await setMatchStage(env, "br-b-" + tag, jobId, "interviewing"), true, "UPDATE row count reported");
  assert.equal(await setMatchStage(env, "missing", jobId, "interviewing"), false);
  await fillJob(env, jobId, "br-a-" + tag, staff, "Bridge placement");
  const job = (await listAllJobs(env)).find((j) => j.id === jobId)!;
  assert.equal(job.status, "filled");
  assert.equal(job.filled_candidate_name, "Bridge A");
  assert.equal((await outreachRecipient(env, "br-a-" + tag)).email, "acct-" + tag + "@example.invalid", "verified account email via auth_accounts view");
  await buildExport(env, "pipeline", staff, jobId);
  const audit = await sql`SELECT actor_user_id FROM recruitment.audit_events WHERE entity_type='jobs' AND entity_id=${jobId} ORDER BY id`;
  assert.ok(audit.length >= 2 && audit.every((a) => a.actor_user_id === staff), "audit rows attributed to the request's actor");

  // Production campaign/CV batches must stay atomic beyond the old 200 limit.
  const large = await env.DB.batch(Array.from({length:1002},()=>env.DB.prepare("SELECT 1 AS n")));
  assert.equal(large.length,1002);
  // A failing statement rolls back the whole batch.
  await assert.rejects(
    env.DB.batch([
      env.DB.prepare("UPDATE recruitment.jobs SET title=? WHERE id=?").bind("Should roll back", jobId),
      env.DB.prepare("SELECT 1/0"),
    ]),
    /Database operation failed/,
  );
  assert.equal((await getJob(env, jobId))?.title, "Bridge Site Manager");

  // Only single SELECT/INSERT/UPDATE/DELETE/WITH statements are accepted.
  await assert.rejects(env.DB.prepare("DROP TABLE recruitment.jobs").run(), /Database operation failed/);
  await assert.rejects(env.DB.prepare("SELECT 1; DROP TABLE recruitment.jobs").run(), /One SQL statement/);
  assert.ok((await sql`SELECT to_regclass('recruitment.jobs') AS t`)[0].t);

  // The bridge is not callable with the public (anon) key.
  const anon = await fetch(`${api}/rest/v1/rpc/uktl_run_batch`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ batch: ["SELECT 1 AS x"] }),
  });
  assert.ok([401, 403, 404].includes(anon.status), `anon must be refused, got ${anon.status}`);
  const anonView = await fetch(`${api}/rest/v1/auth_accounts?select=email`, { headers: { apikey: anonKey, "Accept-Profile": "recruitment" } });
  assert.notEqual(anonView.status, 200, "auth_accounts is not public");
} finally {
  await sql`DELETE FROM recruitment.jobs WHERE id=${"job_br_" + tag}`;
  await sql`DELETE FROM recruitment.candidates WHERE id LIKE ${"br-%-" + tag}`;
  await sql`DELETE FROM recruitment.rate_limits WHERE bucket=${"authAccount:bridge-" + tag}`;
  await sql`DELETE FROM auth.users WHERE id IN (${staff}, ${account})`;
  await sql.end();
}
console.log("PASS: HTTPS bridge — rate limits, type round-trip, injection-safe literals, mandate/ranking/pipeline/fill, auth_accounts view, audited actor, rollback, statement allowlist, anon refused");
