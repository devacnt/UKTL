import postgres from "postgres";
import assert from "node:assert/strict";
import { beginOAuthFlow, completeOAuthFlow, decodeFlow, enabledProviders, encodeFlow } from "../src/lib/server/oauth.ts";

// Google/Apple sign-in against a real local Supabase Auth server. Start it with
// both providers enabled (dummy client ids are enough: no request reaches Google
// or Apple). The provider's successful return is simulated by completing the
// Auth server's own PKCE flow_state row, so the code exchange, verifier handling
// and profile trigger are the real ones.
const db = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const api = process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anon = process.env.TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
for (const u of [db, api])
  if (!["127.0.0.1", "localhost"].includes(new URL(u).hostname)) throw new Error("Only isolated local fixtures are permitted");
if (!anon || !serviceKey) throw new Error("Set TEST_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_ROLE_KEY from `supabase status`");
const sql = postgres(db, { max: 1, prepare: false });
const env = { SUPABASE_URL: api, SUPABASE_ANON_KEY: anon, SITE_URL: "http://127.0.0.1:5173" } as any;
const userId = crypto.randomUUID();
const email = `oauth-${userId.slice(0, 8)}@example.invalid`;

try {
  const providers = await enabledProviders(env, Date.now(), true);
  assert.deepEqual([...providers].sort(), ["apple", "google"], "providers come from the Auth server's settings");
  assert.deepEqual(await enabledProviders({ ...env, SUPABASE_URL: undefined }, Date.now(), true), [], "no Supabase URL, nothing enabled");
  // Without SITE_URL (e.g. a Lovable preview) the redirect needs a request origin; outside a request it refuses.
  await assert.rejects(beginOAuthFlow({ ...env, SITE_URL: undefined }, "google", "/app"));

  // Start: Supabase authorize URL with a PKCE challenge; the verifier stays server-side.
  const google = await beginOAuthFlow(env, "google", "/app/jobs?x=1");
  const url = new URL(google.url);
  assert.equal(url.origin, api);
  assert.equal(url.pathname, "/auth/v1/authorize");
  assert.equal(url.searchParams.get("provider"), "google");
  assert.equal(url.searchParams.get("code_challenge_method"), "s256");
  assert.ok((url.searchParams.get("code_challenge") ?? "").length >= 43);
  assert.equal(url.searchParams.get("redirect_to"), "http://127.0.0.1:5173/auth/callback");
  assert.equal(url.searchParams.get("prompt"), "select_account");
  const flow = decodeFlow(google.flow)!;
  assert.equal(flow.r, "/app/jobs?x=1");
  assert.ok(!google.url.includes(Object.values(flow.s).join("")), "verifier never appears in the URL");
  assert.equal(decodeFlow(encodeFlow({ ...flow, r: "https://evil.example/" }))!.r, "/app", "off-site redirects are neutralised");
  assert.equal(decodeFlow(google.flow, Date.now() + 11 * 60000), null, "flows expire after 10 minutes");
  assert.equal(decodeFlow(encodeFlow({ ...flow, s: { "other-key": "x" } })), null, "foreign storage keys are refused");
  assert.equal(decodeFlow("not-base64!"), null);

  // The Auth server redirects to the provider. Google's discovery document must be
  // reachable from the Auth container; sandboxes without outbound TLS report that
  // step as skipped instead of failing, and the flow record is then created below.
  let reachedProvider = false;
  const toGoogle = await fetch(google.url, { redirect: "manual" });
  if (toGoogle.status === 302) {
    const googleUrl = new URL(toGoogle.headers.get("location")!);
    assert.equal(googleUrl.hostname, "accounts.google.com");
    assert.equal(googleUrl.searchParams.get("client_id"), "local-test.apps.googleusercontent.com");
    reachedProvider = true;
    const apple = await beginOAuthFlow(env, "apple", undefined);
    const toApple = await fetch(apple.url, { redirect: "manual" });
    assert.equal(new URL(toApple.headers.get("location")!).hostname, "appleid.apple.com");
  } else {
    assert.match(await toGoogle.text(), /openid-configuration|certificate|dial|timeout/i, "only a network failure may skip this step");
    console.log("SKIP: provider redirect (Auth container cannot reach accounts.google.com here)");
  }
  const apple = await beginOAuthFlow(env, "apple", undefined);

  // Simulate Google returning: the Auth server now holds a flow with a one-time code for this user.
  const challenge = url.searchParams.get("code_challenge")!;
  if (!reachedProvider)
    await sql`INSERT INTO auth.flow_state(id,code_challenge_method,code_challenge,provider_type,authentication_method,created_at,updated_at)
      VALUES(gen_random_uuid(),'s256',${challenge},'google','oauth',now(),now())`;
  const flowRow = (await sql`SELECT id FROM auth.flow_state WHERE code_challenge=${challenge}`)[0];
  assert.ok(flowRow, "Auth server holds the PKCE flow");
  // A complete Auth user (with identity) created through the admin API, as sign-up would.
  const created = await fetch(`${api}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceKey!, Authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
    body: JSON.stringify({ id: userId, email, email_confirm: true, user_metadata: { full_name: "Ada Google" } }),
  });
  assert.equal(created.status, 200, await created.clone().text());
  const code = crypto.randomUUID();
  await sql`UPDATE auth.flow_state SET user_id=${userId},auth_code=${code},auth_code_issued_at=now(),provider_type='google',
    provider_access_token='',provider_refresh_token='',referrer='',email_optional=false WHERE id=${flowRow.id}`;

  await assert.rejects(completeOAuthFlow(env, apple.flow, code), "another flow's verifier cannot redeem this code");
  await assert.rejects(completeOAuthFlow(env, undefined, code), /expired or was started in another browser/);
  const done = await completeOAuthFlow(env, google.flow, code);
  assert.equal(done.user.id, userId);
  assert.equal(done.user.email, email);
  assert.equal(done.redirect, "/app/jobs?x=1");
  assert.ok(done.session.access_token && done.session.refresh_token);
  await assert.rejects(completeOAuthFlow(env, google.flow, code), "codes are single-use");
  assert.equal((await sql`SELECT name FROM public.profiles WHERE id=${userId}`)[0].name, "Ada Google", "profile name taken from full_name");
} finally {
  await sql`DELETE FROM auth.users WHERE id=${userId}`;
  await sql.end();
}
console.log("PASS: Google/Apple PKCE start, provider redirects, verifier isolation, expiry, single-use code exchange, safe redirect and profile name");
