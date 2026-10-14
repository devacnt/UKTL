import postgres from "postgres";
import assert from "node:assert/strict";
import { postgresQuery } from "../src/lib/server/postgres.ts";
import { saveReedJob, normaliseReedJob } from "../src/lib/server/reed.ts";
import { listJobs } from "../src/lib/server/db.ts";
const url =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Only the isolated local database may be used");
const sql = postgres(url, { max: 1, prepare: false });
class Rollback extends Error {}
try {
  await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path=recruitment,public`;
    const env = {
      DB: {
        prepare(query: string) {
          let values: unknown[] = [];
          const rows = () => {
            const q = postgresQuery(query, values);
            return tx.unsafe(q.sql, q.values as any[]);
          };
          return {
            bind(...args: unknown[]) {
              values = args;
              return this;
            },
            async run() {
              return { success: true, results: await rows() };
            },
            async all() {
              return { success: true, results: await rows() };
            },
          };
        },
      },
    } as any;
    const job = normaliseReedJob(
      {
        jobTitle: "Software engineer",
        minimumSalary: 40000,
        maximumSalary: 60000,
        expirationDate: "01/01/2020",
      },
      901,
      "technology",
    )!;
    await saveReedJob(env, job);
    const original = (await tx`SELECT * FROM jobs WHERE source='reed' AND source_id='901'`)[0];
    await tx`UPDATE jobs SET status='closed',must_have_skills='["python"]' WHERE id=${original.id}`;
    await saveReedJob(env, { ...job, title: "Senior software engineer", salaryMin: 50000 });
    const updated = (await tx`SELECT * FROM jobs WHERE source='reed' AND source_id='901'`)[0];
    assert.equal(updated.id, original.id);
    assert.equal(updated.status, "closed");
    assert.equal(updated.must_have_skills, '["python"]');
    assert.equal(updated.salary_min, 50000);
    await tx`UPDATE jobs SET status='open' WHERE id=${original.id}`;
    assert.ok(!(await listJobs(env)).some((j) => j.id === original.id));
    await saveReedJob(env, { ...job, expiry: "2099-01-01" });
    assert.ok(!(await listJobs(env)).some((j) => j.id === original.id), "Repeat imports cannot resurrect an expired vacancy");
    assert.equal(
      (await tx`SELECT count(*)::int AS n FROM jobs WHERE source='reed' AND source_id='901'`)[0].n,
      1,
    );
    throw new Rollback();
  });
  throw new Error("Fixtures were not rolled back");
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
} finally {
  await sql.end();
}
console.log(
  "PASS: actual PostgreSQL Reed upsert, preserved staff fields, salary refresh and expiry filtering; fixtures rolled back",
);
