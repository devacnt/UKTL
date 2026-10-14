import { getRequestHeader } from "@tanstack/start-server-core";

// The Lovable editor shows previews in a cross-site iframe, where browsers drop
// SameSite=Lax cookies, so sign-in "succeeds" but no session is ever stored.
// Only on preview hosts, use partitioned SameSite=None cookies (CHIPS) so the
// embedded preview keeps its own session. The published site keeps Lax.
const PREVIEW_HOST = /^(id-preview(-[a-z0-9]+)?--[0-9a-f-]{36}\.lovable\.app|[0-9a-f-]{36}\.lovableproject\.com|preview--[a-z0-9-]+\.lovable\.app)$/i;

export function isPreviewHost(host: string | undefined): boolean {
  return !!host && PREVIEW_HOST.test(host.split(":")[0]);
}

export function sessionCookieAttributes(): { sameSite: "lax" | "none"; partitioned?: true } {
  let host: string | undefined;
  try {
    host = (getRequestHeader("x-forwarded-host") ?? getRequestHeader("host"))?.split(",")[0].trim();
  } catch {
    host = undefined;
  }
  return isPreviewHost(host) ? { sameSite: "none", partitioned: true } : { sameSite: "lax" };
}
