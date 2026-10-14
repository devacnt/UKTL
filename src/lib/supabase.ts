import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getCookie, setCookie, deleteCookie } from "@tanstack/start-server-core";
import { getEnv } from "./server/env";
import { sessionCookieAttributes } from "./server/cookie-policy";

// ── Browser client ────────────────────────────────────────────────────────────
// Uses VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (public, safe for browser).
// Call this only in browser/isomorphic contexts.
export function getBrowserSupabase(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  if (!url || !key) throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set");
  return createClient(url, key);
}

// ── Server admin client ───────────────────────────────────────────────────────
// Uses the service role key — bypasses RLS. Only use server-side.
export async function getSupabaseAdmin(): Promise<SupabaseClient> {
  const env = await getEnv();
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) } });
}

// ── Session cookie names ──────────────────────────────────────────────────────
const ACCESS_COOKIE  = "sb-access-token";
const REFRESH_COOKIE = "sb-refresh-token";

// ── Auth helpers (call inside server functions only) ──────────────────────────
export async function getCandidateSession(): Promise<{
  userId: string | null;
  email: string | null;
}> {
  try {
    const accessToken  = await getCookie(ACCESS_COOKIE);
    const refreshToken = await getCookie(REFRESH_COOKIE);
    if (!accessToken && !refreshToken) return { userId: null, email: null };

    const env = await getEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return { userId: null, email: null };

    const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { resolveCandidateSession } = await import("./server/candidate-session");
    const session = await resolveCandidateSession(client.auth, accessToken, refreshToken, setSessionCookies);
    if (session.userId && env.DATA_BACKEND === "supabase") {
      const blocked = await env.DB.prepare("SELECT 1 FROM account_erasures WHERE target_user_id=?::uuid").bind(session.userId).first();
      if (blocked) return { userId: null, email: null };
    }
    return session;
  } catch {
    return { userId: null, email: null };
  }
}

export async function setSessionCookies(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
): Promise<void> {
  const attrs = sessionCookieAttributes();
  await setCookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: true,
    ...attrs,
    maxAge: expiresIn,
    path: "/",
  });
  await setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: true,
    ...attrs,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}

export async function clearSessionCookies(): Promise<void> {
  const attrs = { path: "/", secure: true, ...sessionCookieAttributes() };
  await deleteCookie(ACCESS_COOKIE, attrs);
  await deleteCookie(REFRESH_COOKIE, attrs);
}


export async function createAuthClient(): Promise<SupabaseClient> {
  const env = await getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error("Authentication is not configured");
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
  });
}
/** User-scoped client; cookie claims alone never authorize access. */
export async function getAuthenticatedSupabase() {
  const access_token = getCookie(ACCESS_COOKIE);
  const refresh_token = getCookie(REFRESH_COOKIE);
  if (!refresh_token) throw new Error("Please sign in to continue");
  const client = await createAuthClient();
  const { data, error } = access_token
    ? await client.auth.setSession({ access_token, refresh_token })
    : await client.auth.refreshSession({ refresh_token });
  if (error || !data.session) throw new Error("Please sign in again");
  const verified = await client.auth.getUser(data.session.access_token);
  if (verified.error || !verified.data.user) throw new Error("Please sign in again");
  if (data.session.access_token !== access_token || data.session.refresh_token !== refresh_token) {
    await setSessionCookies(data.session.access_token, data.session.refresh_token, data.session.expires_in);
  }
  return { client, user: verified.data.user, session: data.session };
}
export async function revokeCurrentSession(): Promise<void> {
  try {
    if (getCookie(REFRESH_COOKIE)) {
      const { client } = await getAuthenticatedSupabase();
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw new Error("Session revocation failed. Please try again.");
    }
  } finally {
    await clearSessionCookies();
    deleteCookie("admin_session", { path: "/" });
  }
}
