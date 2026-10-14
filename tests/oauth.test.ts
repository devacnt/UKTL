import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFlow, encodeFlow } from "../src/lib/server/oauth.ts";

const now = Date.UTC(2026, 8, 27, 12);
const flow = { s: { "uktl-oauth-flow-0123456789abcdef0123456789abcdef-code-verifier": '"v"' }, r: "/app/discover", p: "google" as const, t: now };

test("OAuth flow cookies round-trip and are bounded in time, origin and content", () => {
  assert.deepEqual(decodeFlow(encodeFlow(flow), now + 1000), flow);
  assert.equal(decodeFlow(encodeFlow(flow), now + 601000), null, "expired after 10 minutes");
  assert.equal(decodeFlow(encodeFlow({ ...flow, t: now + 120000 }), now), null, "future-dated flows refused");
  assert.equal(decodeFlow(encodeFlow({ ...flow, r: "//evil.example/x" }), now)!.r, "/app");
  assert.equal(decodeFlow(encodeFlow({ ...flow, p: "github" as any }), now), null, "unknown provider refused");
  assert.equal(decodeFlow(encodeFlow({ ...flow, s: { "sb-other-auth-token": "x" } }), now), null, "only PKCE keys accepted");
  assert.equal(decodeFlow(encodeFlow({ ...flow, s: { "uktl-oauth-x": "a".repeat(2000) } }), now), null);
  assert.equal(decodeFlow(undefined, now), null);
  assert.equal(decodeFlow("%%%", now), null);
});

import { assertSameSupabaseProject, databaseUrlRef, supabaseUrlRef } from "../src/lib/server/supabase-project.ts";
test("sign-in and database must be the same Supabase project", () => {
  const a = "abcdefghijklmnopqrst", b = "upjfkkjrmguuhuzkalji";
  assert.equal(supabaseUrlRef(`https://${a}.supabase.co`), a);
  assert.equal(databaseUrlRef(`postgresql://postgres.${a}:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`), a);
  assert.equal(databaseUrlRef(`postgresql://postgres:pw@db.${a}.supabase.co:5432/postgres`), a);
  assertSameSupabaseProject({ SUPABASE_URL: `https://${a}.supabase.co`, DATABASE_URL: `postgresql://postgres.${a}:pw@x.pooler.supabase.com:6543/postgres` });
  assert.throws(
    () => assertSameSupabaseProject({ SUPABASE_URL: `https://${b}.supabase.co`, DATABASE_URL: `postgresql://postgres.${a}:pw@x.pooler.supabase.com:6543/postgres` }),
    /different Supabase projects/,
  );
  // Unrecognisable URLs (local, custom domains) are not guessed at.
  assertSameSupabaseProject({ SUPABASE_URL: "http://127.0.0.1:54321", DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
});

import { resolveServerEnv } from "../src/lib/server/env-resolve.ts";
test("UKTL_ settings win over Lovable Cloud's and never mix with them", () => {
  const cloud = {
    SUPABASE_URL: "https://jwfycrmrgwslxyxvirfn.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_cloud",
    SUPABASE_SERVICE_ROLE_KEY: "cloud-service",
  };
  // Lovable Cloud alone: its public values are used (nothing else configured).
  assert.equal(resolveServerEnv(cloud).SUPABASE_URL, cloud.SUPABASE_URL);
  assert.equal(resolveServerEnv(cloud).SUPABASE_ANON_KEY, "sb_publishable_cloud");
  assert.equal(resolveServerEnv(cloud).DATA_BACKEND, "supabase");
  const uktl = {
    ...cloud,
    UKTL_SUPABASE_URL: "https://fvkffdeindboirukscfq.supabase.co",
    UKTL_SUPABASE_ANON_KEY: "uktl-anon",
    UKTL_DATABASE_URL: "postgresql://postgres.fvkffdeindboirukscfq:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
    UKTL_SUPABASE_SERVICE_ROLE_KEY: "uktl-service",
  };
  const env = resolveServerEnv(uktl);
  assert.equal(env.SUPABASE_URL, uktl.UKTL_SUPABASE_URL);
  assert.equal(env.SUPABASE_ANON_KEY, "uktl-anon");
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, "uktl-service");
  assert.equal(env.DATABASE_URL, uktl.UKTL_DATABASE_URL);
  // A partly configured UKTL project never borrows Lovable Cloud's keys.
  const partial = resolveServerEnv({ ...cloud, UKTL_SUPABASE_URL: uktl.UKTL_SUPABASE_URL });
  assert.equal(partial.SUPABASE_ANON_KEY, undefined);
  assert.equal(partial.SUPABASE_SERVICE_ROLE_KEY, undefined);
});
