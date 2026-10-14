import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { parseCv } from "../src/lib/server/parse.ts";
import { sendNotificationEmail, deliverNotification } from "../src/lib/server/notify.ts";
import { databaseFixture } from "./database-fixture.ts";
import { syncReedJobs } from "../src/lib/server/reed.ts";

test("Reed sync counts saved, duplicate and failed rows separately", async () => {
  const { db, env } = databaseFixture(); env.REED_API_KEY = "test";
  try {
    globalThis.fetch = async (url) => String(url).includes("/jobs/") ? Response.json({ jobTitle: String(url).endsWith("/11") ? "Software engineer" : null }) : new Response(JSON.stringify({ results: [
      { jobId: 11, jobTitle: "Test engineer" },
      { jobId: 11, jobTitle: "Duplicate" },
      { jobId: 12, jobTitle: null },
    ] }));
    const result = await syncReedJobs(env, { keywords: "test", sector: "technology", resultsToTake: 3 });
    assert.deepEqual(result, { saved: 1, skipped: 1, failed: 1, total: 3, partial: true });
  } finally { db.close(); }
});

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const cv = { kind: "text", text: "Test candidate", filename: "cv.txt" } as const;
const response = (text: string) => new Response(JSON.stringify({ content: [{ type: "text", text }] }));

test("missing AI key never generates a fabricated CV score", async () => {
  await assert.rejects(parseCv(cv, {}), /not configured/);
});

test("upstream grading failure and malformed output are explicit failures", async () => {
  for (const grade of [new Response("unavailable", { status: 503 }), response("not-json"), response('{"score":50,"notes":[]}')]) {
    let calls = 0;
    globalThis.fetch = async () => ++calls === 1 ? response('{"name":"Test Candidate"}') : grade;
    await assert.rejects(parseCv(cv, { apiKey: "test-only" }), /grading/);
  }
});

test("valid grading preserves a real zero score", async () => {
  let calls = 0;
  const quality = { score: 0, notes: [], breakdown: { contact_information: 0, experience: 0, skills: 0, education: 0, clarity: 0 },
    improvement_report: { contact_information: "Missing", experience: "Missing", skills: "Missing", education: "Missing", clarity: "Improve structure", overall: "Incomplete" } };
  globalThis.fetch = async () => response(JSON.stringify(++calls === 1 ? { name: "Candidate" } : quality));
  assert.equal((await parseCv(cv, { apiKey: "test-only" })).quality.score, 0);
});

test("email non-2xx failures are reported without provider body or credentials", async () => {
  globalThis.fetch = async (_url, init) => {
    assert.equal(new Headers(init?.headers).get("Idempotency-Key"), "test-key");
    return new Response("private provider response", { status: 403 });
  };
  assert.deepEqual(await sendNotificationEmail({ RESEND_API_KEY: "test" } as any, { subject: "Test", text: "Test" }, "test-key"),
    { status: "failed", reason: "Resend HTTP 403" });
});

test("notification claims prevent concurrent duplicates and track failures for retry", async () => {
  const { env, db } = databaseFixture(); env.RESEND_API_KEY = "test";
  try {
    db.prepare("INSERT INTO enquiries (id,created_at,name,email,message) VALUES (?,?,?,?,?)")
      .run("enq-test", Date.now(), "Test", "test@example.test", "Test");
    let sends = 0;
    globalThis.fetch = async () => { sends++; return new Response("", { status: 503 }); };
    await Promise.all([deliverNotification(env, "enquiries", "enq-test"), deliverNotification(env, "enquiries", "enq-test")]);
    assert.equal(sends, 1);
    assert.equal(db.prepare("SELECT notification_status FROM enquiries").get()?.notification_status, "failed");
    globalThis.fetch = async () => { sends++; return new Response('{"id":"email-id"}'); };
    assert.equal((await deliverNotification(env, "enquiries", "enq-test")).status, "sent");
    await deliverNotification(env, "enquiries", "enq-test");
    assert.equal(sends, 2);
    db.prepare("UPDATE enquiries SET notification_status='failed', created_at=?").run(Date.now() - 86400000);
    assert.equal((await deliverNotification(env, "enquiries", "enq-test")).status, "skipped");
    assert.equal(sends, 2);
  } finally { db.close(); }
});
