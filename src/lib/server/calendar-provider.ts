import type { AppEnv } from "./env";
import { boundedText } from "./bounded-response.ts";
export type CalendarProvider = "google" | "outlook";
export const providers = ["google", "outlook"] as const;
export function calendarConfig(env: AppEnv, provider: CalendarProvider) {
  const url = new URL(env.SITE_URL || "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  )
    throw new Error("A canonical HTTPS SITE_URL is required");
  const id =
    provider === "google" ? env.GOOGLE_CALENDAR_CLIENT_ID : env.MICROSOFT_CALENDAR_CLIENT_ID;
  const secret =
    provider === "google"
      ? env.GOOGLE_CALENDAR_CLIENT_SECRET
      : env.MICROSOFT_CALENDAR_CLIENT_SECRET;
  if (!id || !secret || !env.CALENDAR_ENCRYPTION_KEY)
    throw new Error("Calendar provider credentials are not configured");
  return {
    id,
    secret,
    redirect: `${url.origin}/api/calendar/callback/${provider}`,
    authorize:
      provider === "google"
        ? "https://accounts.google.com/o/oauth2/v2/auth"
        : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token:
      provider === "google"
        ? "https://oauth2.googleapis.com/token"
        : "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope:
      provider === "google"
        ? "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.freebusy"
        : "offline_access https://graph.microsoft.com/Calendars.ReadWrite",
  };
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
export const base64url = (bytes: Uint8Array) =>
  encode(bytes).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
export async function digest(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
async function key(secret: string | undefined) {
  if (!secret || !/^[A-Za-z0-9+/]{43}=$/.test(secret))
    throw new Error("Calendar encryption requires a base64-encoded 32-byte key");
  const bytes = decode(secret);
  if (bytes.length !== 32) throw new Error("Invalid calendar encryption key");
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
export async function encryptCalendarSecret(
  secret: string | undefined,
  text: string,
  context: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) },
    await key(secret),
    new TextEncoder().encode(text),
  );
  return `v1.${encode(iv)}.${encode(new Uint8Array(body))}`;
}
export async function decryptCalendarSecret(
  secret: string | undefined,
  text: string,
  context: string,
) {
  const [version, iv, data] = text.split(".");
  if (version !== "v1" || !iv || !data) throw new Error("Invalid encrypted calendar credential");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(iv), additionalData: new TextEncoder().encode(context) },
      await key(secret),
      decode(data),
    ),
  );
}
export async function calendarToken(
  env: AppEnv,
  provider: CalendarProvider,
  fields: Record<string, string>,
) {
  const cfg = calendarConfig(env, provider);
  const response = await fetch(cfg.token, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...fields, client_id: cfg.id, client_secret: cfg.secret }),
  });
  if (!response.ok)
    throw new Error(`Calendar authorization failed (${response.status}); reconnect the account`);
  const data = JSON.parse(await boundedText(response, 32768));
  if (typeof data.access_token !== "string" || data.access_token.length > 16000)
    throw new Error("Calendar token response was invalid");
  if (
    data.refresh_token !== undefined &&
    (typeof data.refresh_token !== "string" || data.refresh_token.length > 16000)
  )
    throw new Error("Calendar refresh response was invalid");
  return data as { access_token: string; refresh_token?: string };
}
export async function startCalendarConnection(
  env: AppEnv,
  provider: CalendarProvider,
  userId: string,
) {
  const existing = await env.DB.prepare(
    "SELECT provider FROM calendar_connections WHERE provider=?",
  )
    .bind(provider)
    .first();
  if (existing)
    throw new Error("Disconnect the existing calendar before connecting another account");
  const cfg = calendarConfig(env, provider),
    state = base64url(crypto.getRandomValues(new Uint8Array(32))),
    verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const hash = await digest(state),
    challenge = base64url(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
    );
  await env.DB.batch([
    env.DB.prepare("DELETE FROM calendar_oauth_states WHERE expires_at<?").bind(Date.now()),
    env.DB.prepare(
      "INSERT INTO calendar_oauth_states(state_hash,provider,user_id,verifier_encrypted,expires_at) VALUES(?,?,?::uuid,?,?)",
    ).bind(
      hash,
      provider,
      userId,
      await encryptCalendarSecret(env.CALENDAR_ENCRYPTION_KEY, verifier, hash),
      Date.now() + 600000,
    ),
  ]);
  const url = new URL(cfg.authorize);
  url.search = new URLSearchParams({
    client_id: cfg.id,
    redirect_uri: cfg.redirect,
    response_type: "code",
    scope: cfg.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(provider === "google"
      ? { access_type: "offline", prompt: "consent" }
      : { prompt: "select_account" }),
  }).toString();
  return url.toString();
}
export async function finishCalendarConnection(
  env: AppEnv,
  provider: CalendarProvider,
  userId: string,
  state: string,
  code: string,
) {
  if (state.length > 100 || code.length > 8192) throw new Error("Invalid calendar callback");
  const hash = await digest(state),
    row = await env.DB.prepare(
      "DELETE FROM calendar_oauth_states WHERE state_hash=? AND provider=? AND user_id=?::uuid AND expires_at>? RETURNING verifier_encrypted",
    )
      .bind(hash, provider, userId, Date.now())
      .first<{ verifier_encrypted: string }>();
  if (!row) throw new Error("Calendar authorization expired or was already used");
  const token = await calendarToken(env, provider, {
    grant_type: "authorization_code",
    code,
    redirect_uri: calendarConfig(env, provider).redirect,
    code_verifier: await decryptCalendarSecret(
      env.CALENDAR_ENCRYPTION_KEY,
      row.verifier_encrypted,
      hash,
    ),
  });
  if (!token.refresh_token)
    throw new Error("Offline calendar access was not granted. Reconnect and allow offline access");
  const result = await env.DB.prepare(
    "INSERT INTO calendar_connections(provider,connected_by,refresh_token_encrypted,connected_at) VALUES(?,?::uuid,?,?) ON CONFLICT DO NOTHING RETURNING provider",
  )
    .bind(
      provider,
      userId,
      await encryptCalendarSecret(
        env.CALENDAR_ENCRYPTION_KEY,
        token.refresh_token,
        `${provider}:${userId}`,
      ),
      Date.now(),
    )
    .first();
  if (!result) throw new Error("A calendar is already connected");
}
export async function providerRequest(
  provider: CalendarProvider,
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
) {
  const base =
    provider === "google"
      ? "https://www.googleapis.com/calendar/v3"
      : "https://graph.microsoft.com/v1.0";
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid calendar resource");
  const response = await fetch(base + path, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(provider === "outlook" ? { Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok && ![404, 409, 410].includes(response.status))
    throw new Error(`Calendar API failed (${response.status})`);
  const text = response.status === 204 ? "" : await boundedText(response, 2 * 1024 * 1024);
  return { status: response.status, data: text ? JSON.parse(text) : null };
}
