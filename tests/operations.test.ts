import { test } from "node:test";
import assert from "node:assert/strict";
import { safeRedirect } from "../src/lib/safe-redirect.ts";
import { scanPrivateCv, scannerEndpoint } from "../src/lib/server/malware-scan.ts";
import { readTokenUsage, trackedAnthropicFetch } from "../src/lib/server/ai-usage.ts";
import { finishFileDeletion } from "../src/lib/server/operations.ts";
import { exportOwnData } from "../src/lib/server/privacy.ts";

test("redirect stays same-origin for backslashes, control characters and network paths", () => {
  for (const value of [
    "//evil.invalid",
    "/\\evil.invalid",
    "/\t/evil.invalid",
    "https://evil.invalid",
    "javascript:alert(1)",
    "/\n/evil.invalid",
  ])
    assert.equal(safeRedirect(value), "/app");
  assert.equal(safeRedirect("/app/discover?tab=history"), "/app/discover?tab=history");
});
test("scanner configuration rejects missing credentials and unsafe destinations", () => {
  const token = "x".repeat(40);
  for (const url of [
    "http://scanner.example/scan",
    "https://localhost/scan",
    "https://127.0.0.1/scan",
    "https://scanner.example/scan?token=x",
    "https://user:pass@scanner.example/scan",
  ])
    assert.throws(() => scannerEndpoint({ url, token }));
  assert.throws(() => scannerEndpoint({ url: "https://scanner.example/scan", token: "short" }));
});
test("private file scan requires a clean verdict bound to exact bytes; all other outcomes fail closed", async () => {
  const original = globalThis.fetch,
    bytes = new TextEncoder().encode("synthetic CV").buffer,
    config = { url: "https://scanner.example/scan", token: "x".repeat(40) };
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init?.redirect, "error");
      return Response.json({
        verdict: "clean",
        sha256: new Headers(init?.headers).get("x-content-sha256"),
      });
    };
    await scanPrivateCv(bytes, config);
    for (const verdict of ["infected", "unknown", "timeout"]) {
      globalThis.fetch = async () => Response.json({ verdict });
      await assert.rejects(scanPrivateCv(bytes, config));
    }
    globalThis.fetch = async () => Response.json({ verdict: "clean", sha256: "wrong-file" });
    await assert.rejects(scanPrivateCv(bytes, config));
    globalThis.fetch = async () => {
      throw new Error("provider body containing secret");
    };
    await assert.rejects(
      scanPrivateCv(bytes, config),
      (e) => e instanceof Error && !e.message.includes("secret"),
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("token reporting preserves unknown and real zero values", () => {
  assert.deepEqual(readTokenUsage({}), {
    input: null,
    output: null,
    cacheRead: null,
    cacheWrite: null,
  });
  assert.equal(readTokenUsage({ usage: { input_tokens: 0, output_tokens: -1 } }).input, 0);
  assert.equal(readTokenUsage({ usage: { output_tokens: -1 } }).output, null);
});
test("AI budget failure prevents the provider call", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({});
  };
  try {
    await assert.rejects(
      trackedAnthropicFetch(
        {
          DATA_BACKEND: "supabase",
          DB: {
            prepare() {
              return {
                bind() {
                  return this;
                },
                async first() {
                  throw new Error("budget reached");
                },
              };
            },
          },
        } as any,
        "grading",
        "model",
        {},
      ),
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
function deletionFixture(keys: string[], referenced = false) {
  let completed = false;
  const removed: string[] = [];
  const env = {
    DB: {
      prepare(sql: string) {
        return {
          bind() {
            return this;
          },
          async first() {
            return sql.includes("FROM file_deletions")
              ? { candidate_id: "candidate", storage_keys: keys, status: "pending" }
              : referenced
                ? { n: 1 }
                : null;
          },
          async run() {
            completed = true;
            return { success: true };
          },
        };
      },
    },
    CV_BUCKET: {
      async delete(key: string) {
        removed.push(key);
      },
    },
  } as any;
  return { env, removed, completed: () => completed };
}
test("private deletion refuses foreign and currently referenced keys", async () => {
  for (const key of ["cvs/other/file.pdf", "cvs/candidate/../file.pdf"]) {
    const f = deletionFixture([key]);
    await assert.rejects(finishFileDeletion(f.env, "id"));
    assert.deepEqual(f.removed, []);
    assert.equal(f.completed(), false);
  }
  const f = deletionFixture(["cvs/candidate/file.pdf"], true);
  await assert.rejects(finishFileDeletion(f.env, "id"));
  assert.deepEqual(f.removed, []);
});
test("failed storage cleanup remains retryable and never claims completion", async () => {
  const f = deletionFixture(["cvs/candidate/file.pdf"]);
  f.env.CV_BUCKET.delete = async () => {
    throw new Error("provider offline");
  };
  await assert.rejects(finishFileDeletion(f.env, "id"));
  assert.equal(f.completed(), false);
  const ok = deletionFixture(["cvs/candidate/file.pdf"]);
  assert.equal((await finishFileDeletion(ok.env, "id")).status, "completed");
  assert.deepEqual(ok.removed, ["cvs/candidate/file.pdf"]);
  assert.equal(ok.completed(), true);
});
test("self-service export binds verified owner on every query and refuses silent truncation", async () => {
  const values: unknown[] = [];
  const env = {
    DATA_BACKEND: "supabase",
    DB: {
      prepare() {
        return {
          bind(id: unknown) {
            values.push(id);
            return this;
          },
        };
      },
      async batch(statements: unknown[]) {
        return statements.map(() => ({ success: true, results: [] }));
      },
    },
  } as any;
  await exportOwnData(env, "verified-owner");
  assert.ok(values.length > 5);
  assert.ok(values.every((v) => v === "verified-owner"));
  env.DB.batch = async () => [{ success: true, results: Array.from({ length: 1001 }, () => ({})) }];
  await assert.rejects(exportOwnData(env, "verified-owner"));
});

test('account erasure requires explicit review and leaves provider failures pending',async()=>{
 const {completeAccountErasure}=await import('../src/lib/server/account-erasure.ts');
 let calls=0,finished=false,userExists=true;
 const env={DATA_BACKEND:'supabase',DB:{prepare(sql:string){return {bind(){return this;},async run(){return {success:true};},async first(){return sql.includes('auth_accounts')?(userExists?{id:'subject'}:null):{target_user_id:'subject',file_deletion_ids:[],status:'pending'};}};},async batch(){finished=true;return [];}}} as any;
 const auth={async deleteUser(){calls++;return {error:{status:503}};}};
 await assert.rejects(completeAccountErasure(env,'request','admin',false,auth));assert.equal(calls,0);
 assert.equal((await completeAccountErasure(env,'request','admin',true,auth)).status,'pending');assert.equal(finished,false);
 assert.equal((await completeAccountErasure(env,'request','admin',true,{async deleteUser(){return {error:{status:404}};}})).status,'pending');assert.equal(finished,false);
 userExists=false;
 assert.equal((await completeAccountErasure(env,'request','admin',true,{async deleteUser(){return {error:{status:404}};}})).status,'completed');assert.equal(finished,true);
});
