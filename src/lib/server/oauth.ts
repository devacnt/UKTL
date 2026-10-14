import { createClient } from "@supabase/supabase-js";
import { getCookie, setCookie, deleteCookie } from "@tanstack/start-server-core";
import type { AppEnv } from "./env";
import { safeRedirect } from "../safe-redirect.ts";
import { authCallbackUrl } from "./site-url.ts";
import { sessionCookieAttributes } from "./cookie-policy.ts";

/**
 * Candidate sign-in with Google or Apple through Supabase Auth, PKCE flow,
 * completed entirely on the server:
 *   start    → Supabase issues the provider URL; the PKCE verifier and the
 *              post-sign-in destination go into a short-lived httpOnly cookie
 *   callback → the one-time code plus that verifier are exchanged with Supabase
 *              for a session, stored in the usual httpOnly session cookies.
 * Tokens never reach the URL fragment or browser storage.
 */
export const OAUTH_PROVIDERS = ["google", "apple"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

const FLOW_COOKIE = "uktl-oauth-flow";
const FLOW_TTL_SECONDS = 600;
const STORAGE_KEY = "uktl-oauth";

type Flow = { s: Record<string, string>; r: string; p: OAuthProvider; t: number };

/** In-memory storage adapter so the PKCE verifier can be carried in a cookie. */
function memoryStorage(initial: Record<string, string> = {}) {
  const items: Record<string, string> = { ...initial };
  return {
    items,
    getItem: (key: string) => (key in items ? items[key] : null),
    setItem: (key: string, value: string) => {
      items[key] = value;
    },
    removeItem: (key: string) => {
      delete items[key];
    },
  };
}

function pkceClient(env: AppEnv, storage: ReturnType<typeof memoryStorage>) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.error("[auth] not configured: SUPABASE_URL / SUPABASE_ANON_KEY missing");
    throw new Error("Sign-in is temporarily unavailable. Please try again shortly.");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      flowType: "pkce",
      persistSession: true, // required for the custom storage to be used; it lives only in memory
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage,
      storageKey: STORAGE_KEY,
    },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
  });
}

export function callbackUrl(env: AppEnv) {
  return authCallbackUrl(env);
}

export function encodeFlow(flow: Flow) {
  return btoa(JSON.stringify(flow)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeFlow(raw: string | undefined, now = Date.now()): Flow | null {
  if (!raw || raw.length > 4096) return null;
  try {
    const json = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    const flow = JSON.parse(json) as Flow;
    if (!flow || typeof flow.s !== "object" || !OAUTH_PROVIDERS.includes(flow.p)) return null;
    if (typeof flow.t !== "number" || now - flow.t > FLOW_TTL_SECONDS * 1000 || flow.t > now + 60000) return null;
    for (const [k, v] of Object.entries(flow.s))
      if (!k.startsWith(STORAGE_KEY) || typeof v !== "string" || v.length > 1024) return null;
    return { ...flow, r: safeRedirect(flow.r) };
  } catch {
    return null;
  }
}

/** Which providers are switched on in Supabase Auth (public settings endpoint), cached briefly. */
let cachedProviders: { at: number; value: OAuthProvider[] } | null = null;
export async function enabledProviders(env: AppEnv, now = Date.now(), fresh = false): Promise<OAuthProvider[]> {
  if (!fresh && cachedProviders && now - cachedProviders.at < 300000) return cachedProviders.value;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return [];
  try {
    const res = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/settings`, {
      headers: { apikey: env.SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    const value = OAUTH_PROVIDERS.filter((p) => settings.external?.[p] === true);
    cachedProviders = { at: now, value };
    return value;
  } catch {
    return [];
  }
}

/** Core of the start step (no cookies): the provider URL and the flow cookie value. */
export async function beginOAuthFlow(env: AppEnv, provider: OAuthProvider, redirect: string | undefined, now = Date.now()) {
  if (!(await enabledProviders(env)).includes(provider))
    throw new Error(`${provider === "apple" ? "Apple" : "Google"} sign-in is not available yet`);
  const storage = memoryStorage();
  const { data, error } = await pkceClient(env, storage).auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl(env),
      skipBrowserRedirect: true,
      // Apple sends the name only on first consent; email is always requested.
      scopes: provider === "apple" ? "name email" : "openid email profile",
      queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
    },
  });
  if (error || !data?.url) throw new Error("Sign-in could not be started. Please try again.");
  const url = new URL(data.url);
  if (url.origin !== new URL(env.SUPABASE_URL!).origin) throw new Error("Unexpected sign-in address");
  return { url: url.href, flow: encodeFlow({ s: storage.items, r: safeRedirect(redirect), p: provider, t: now }) };
}

/** Core of the callback step (no cookies): exchanges the one-time code using the flow's verifier. */
export async function completeOAuthFlow(env: AppEnv, flowCookie: string | undefined, code: string, flowId?: string) {
  const flow = decodeFlow(flowCookie);
  if (!flow) throw new Error("This sign-in has expired or was started in another browser. Please try again.");
  const client = pkceClient(env, memoryStorage(flow.s));
  const { data, error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
  if (error || !data.session || !data.user) throw new Error("Sign-in could not be completed. Please try again.");
  const verified = await client.auth.getUser(data.session.access_token);
  if (verified.error || !verified.data.user) throw new Error("Sign-in could not be completed. Please try again.");
  return { session: data.session, user: verified.data.user, redirect: flow.r, provider: flow.p };
}

export async function startOAuth(env: AppEnv, provider: OAuthProvider, redirect: string | undefined) {
  const { url, flow } = await beginOAuthFlow(env, provider, redirect);
  await setCookie(FLOW_COOKIE, flow, { httpOnly: true, secure: true, ...sessionCookieAttributes(), maxAge: FLOW_TTL_SECONDS, path: "/" });
  return { url };
}

export async function finishOAuth(env: AppEnv, code: string, flowId: string | undefined) {
  const cookie = getCookie(FLOW_COOKIE);
  // One attempt per flow, whatever happens next.
  await deleteCookie(FLOW_COOKIE, { path: "/", secure: true, ...sessionCookieAttributes() });
  return completeOAuthFlow(env, cookie, code, flowId);
}
