import postgres from "postgres";
import assert from "node:assert/strict";
import { postgresQuery } from "../src/lib/server/postgres.ts";
import { createJob, updateJob, deleteJob, listJobs, listAllJobs } from "../src/lib/server/db.ts";
import { rankCandidatesForJob, addToPipeline, fillJob, reopenJob } from "../src/lib/server/job-tools.ts";

// Mandate lifecycle against real PostgreSQL: duration, whole-database ranking,
// pipeline additions, atomic fill with placement, reopen, erasure and delete.
const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Only isolated local database fixtures are permitted");
const sql = postgres(url, { max: 1, prepare: false });
class Rollback extends Error {}
try {
  await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path=recruitment,public`;
    const env = {
      DATA_BACKEND: "supabase",
      DB: {
        prepare(query: string) {
          let values: unknown[] = [];
          return {
            bind(...args: unknown[]) {
              values = args;
              return this;
            },
            async execute(connection?: typeof tx) {
              const q = postgresQuery(query, values);
              const run = (c: typeof tx) => c.unsafe(q.sql, q.values as any[]);
              return connection ? run(connection) : tx.savepoint(run);
            },
            async first() {
              return (await this.execute())[0] ?? null;
            },
            async all() {
              return { success: true, results: await this.execute() };
            },
            async run() {
              const rows = await this.execute();
              return { success: true, results: rows, meta: { changes: rows.count } };
            },
          };
        },
        async batch(statements: any[]) {
          return tx.savepoint(async (sub) => {
            const results = [];
            for (const statement of statements) results.push({ success: true, results: await statement.execute(sub) });
            return results;
          });
        },
      },
    } as any;
    await tx`DELETE FROM candidates`;
    await tx`DELETE FROM jobs`;
    const staff = crypto.randomUUID();
    await tx`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${staff},'jobs-staff@example.invalid',now())`;
    const profile = (skills: string[], years: number, seniority: string, location: string) =>
      JSON.stringify({ skills: skills.map((skill) => ({ skill })), experience: [], education: [], total_years_experience: years, seniority, location });
    const now = Date.now();
    await tx`INSERT INTO candidates(id,created_at,updated_at,status,name,quality_score,raw_profile) VALUES
      ('job-best',${now},${now},'parsed','Best Fit',70,${profile(["SMSTS", "CSCS"], 8, "senior", "Leeds")}),
      ('job-half',${now},${now},'parsed','Half Fit',95,${profile(["SMSTS"], 8, "senior", "Leeds")}),
      ('job-none',${now},${now},'parsed','No Fit',50,${profile([], 1, "junior", "Bristol")}),
      ('job-unparsed',${now},${now},'failed','Not Parsed',NULL,NULL)`;

    const input = { title: "Site Manager", company: null, location: "Leeds", sector: "construction", seniority: "senior", min_years_experience: 5,
      description: null, must_have_skills: ["SMSTS", "CSCS"], nice_to_have_skills: [], status: "open" as const, posted_date: "2026-01-01", expiry_date: "2099-12-31" };
    await createJob(env, "job_fixture", input);
    await createJob(env, "job_expired", { ...input, title: "Expired", expiry_date: "2020-01-01" });
    const visible = (await listJobs(env)).map((j) => j.id);
    assert.ok(visible.includes("job_fixture") && !visible.includes("job_expired"), "closing date hides a mandate from candidates");
    await assert.rejects(
      tx.savepoint((sp) => sp`UPDATE jobs SET expiry_date='next week' WHERE id='job_fixture'`),
      "closing dates must be ISO dates",
    );

    // Ranking scans the whole database, not only existing pipeline rows.
    const ranking = await rankCandidatesForJob(env, "job_fixture");
    assert.equal(ranking.scanned, 3, "unparsed CVs are not scored");
    assert.deepEqual(ranking.candidates.map((c) => c.id), ["job-best", "job-half", "job-none"]);
    assert.equal(ranking.qualifiedCount, 1);
    assert.deepEqual((await rankCandidatesForJob(env, "job_fixture", { qualifiedOnly: true })).candidates.map((c) => c.id), ["job-best"]);
    assert.ok((await rankCandidatesForJob(env, "job_fixture", { minScore: 101 })).candidates.length === 0);

    const added = await addToPipeline(env, "job_fixture", ["job-best", "job-half", "job-unparsed"]);
    assert.deepEqual(added, { added: 2, skipped: 1 });
    await tx`UPDATE matches SET stage='interviewing' WHERE candidate_id='job-half' AND job_id='job_fixture'`;
    await addToPipeline(env, "job_fixture", ["job-half"]);
    assert.equal((await tx`SELECT stage FROM matches WHERE candidate_id='job-half' AND job_id='job_fixture'`)[0].stage, "interviewing", "re-adding never resets a stage");
    assert.equal((await rankCandidatesForJob(env, "job_fixture")).candidates[0].stage, "matched");

    // Fill: job closes to candidates and the placed candidate moves to 'placed' atomically.
    await fillJob(env, "job_fixture", "job-best", staff, "Starts 1 March");
    let job = (await listAllJobs(env)).find((j) => j.id === "job_fixture")!;
    assert.equal(job.status, "filled");
    assert.equal(job.filled_candidate_name, "Best Fit");
    assert.equal(job.filled_note, "Starts 1 March");
    assert.equal((await tx`SELECT stage FROM matches WHERE candidate_id='job-best' AND job_id='job_fixture'`)[0].stage, "placed");
    assert.equal((await tx`SELECT count(*)::int AS n FROM stage_history WHERE candidate_id='job-best' AND to_stage='placed'`)[0].n, 1, "placement recorded in stage history");
    assert.ok(!(await listJobs(env)).some((j) => j.id === "job_fixture"), "filled mandates leave discovery");
    await assert.rejects(fillJob(env, "job_fixture", "job-half", staff), /already marked as filled/);
    // Editing a filled mandate keeps it filled.
    await updateJob(env, "job_fixture", { ...input, title: "Site Manager (Leeds)" });
    assert.equal((await tx`SELECT status FROM jobs WHERE id='job_fixture'`)[0].status, "filled");
    await assert.rejects(
      tx.savepoint((sp) => sp`UPDATE jobs SET status='filled',filled_at=NULL WHERE id='job_expired'`),
      "a filled mandate always records when",
    );
    // Placing someone never added to the pipeline creates their placed row.
    await fillJob(env, "job_expired", "job-none", staff);
    assert.equal((await tx`SELECT stage FROM matches WHERE candidate_id='job-none' AND job_id='job_expired'`)[0].stage, "placed");
    await assert.rejects(fillJob(env, "job_missing", "job-best", staff), /not found/);
    await assert.rejects(fillJob(env, "job_expired", "missing", staff));

    // Reopen clears the placement and sets a new closing date; past dates are refused.
    await assert.rejects(reopenJob(env, "job_fixture", "2020-01-01"), /in the past/);
    await reopenJob(env, "job_fixture", "2099-06-30");
    job = (await listAllJobs(env)).find((j) => j.id === "job_fixture")!;
    assert.equal(job.status, "open");
    assert.equal(job.filled_candidate_id, null);
    assert.equal(job.expiry_date, "2099-06-30");
    await assert.rejects(reopenJob(env, "job_fixture", null), /Only closed or filled/);

    // Candidate erasure never blocks on a placement; the job keeps "filled" with no name.
    await fillJob(env, "job_fixture", "job-best", staff);
    await tx`DELETE FROM candidates WHERE id='job-best'`;
    const erased = (await tx`SELECT status,filled_candidate_id,filled_at FROM jobs WHERE id='job_fixture'`)[0];
    assert.equal(erased.status, "filled");
    assert.equal(erased.filled_candidate_id, null);

    await deleteJob(env, "job_fixture");
    assert.equal((await tx`SELECT count(*)::int AS n FROM matches WHERE job_id='job_fixture'`)[0].n, 0, "delete removes the pipeline");
    assert.equal(
      (await tx`SELECT has_function_privilege('authenticated','recruitment.fill_job(text,text,uuid,text,bigint,bigint,bigint,bigint,bigint,text,text,text)','EXECUTE') AS x`)[0].x,
      false,
    );
    throw new Rollback();
  });
  throw new Error("Fixture transaction did not roll back");
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
} finally {
  await sql.end();
}
console.log("PASS: mandate duration, whole-database ranking, pipeline additions, atomic fill/placement, reopen, erasure and delete; fixtures rolled back");
