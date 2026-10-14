import { getRequestHeader } from "@tanstack/start-server-core";
import type { AppEnv } from "./env";

/**
 * Public origin for auth redirects: SITE_URL when configured, otherwise the
 * origin this request arrived on (e.g. the Lovable preview or published URL).
 * Safe as a fallback because Supabase Auth only redirects to URLs on its
 * allow-list; a forged Host header cannot send a user anywhere unlisted.
 */
export function siteOrigin(env: Pick<AppEnv, "SITE_URL">): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/+$/, "");
  let host: string | undefined;
  let proto: string | undefined;
  try {
    host = (getRequestHeader("x-forwarded-host") ?? getRequestHeader("host"))?.split(",")[0].trim();
    proto = getRequestHeader("x-forwarded-proto")?.split(",")[0].trim();
  } catch {
    host = undefined;
  }
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) throw new Error("SITE_URL not configured");
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  return `${proto === "http" && local ? "http" : "https"}://${host.toLowerCase()}`;
}

export const authCallbackUrl = (env: Pick<AppEnv, "SITE_URL">) => `${siteOrigin(env)}/auth/callback`;
