import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/start-server-core";
import { z } from "zod";
import { getEnv } from "./server/env";
import { enforceRateLimit, RateLimitError } from "./server/ratelimit";
import { enabledProviders, startOAuth, finishOAuth, OAUTH_PROVIDERS } from "./server/oauth";

/** Candidate-facing errors: our own messages and rate limits pass through; configuration or provider details never do. */
function safeAuthError(e: unknown): never {
  if (e instanceof RateLimitError) throw e;
  const message = e instanceof Error ? e.message : "";
  if (/^(This sign-in|Sign-in could not|(Google|Apple) sign-in is not available)/.test(message)) throw new Error(message);
  throw new Error("Sign-in is temporarily unavailable. Please try again or use your email and password.");
}

/** Providers switched on in Supabase Auth; the sign-in pages show only these. */
export const oauthProvidersFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return await enabledProviders(await getEnv());
  } catch {
    return [];
  }
});

export const oauthStartFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ provider: z.enum(OAUTH_PROVIDERS), redirect: z.string().max(500).optional() }).strict().parse(raw),
  )
  .handler(async ({ data }) => {
    try {
      const env = await getEnv();
      await enforceRateLimit(env, "authAccount", getRequestHeader("cf-connecting-ip") ?? "unknown");
      return await startOAuth(env, data.provider, data.redirect);
    } catch (e) {
      safeAuthError(e);
    }
  });

export const oauthFinishFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        code: z.string().min(8).max(1024).regex(/^[\w.~-]+$/),
        flowId: z.string().regex(/^[a-f0-9]{32}$/).optional(),
      })
      .strict()
      .parse(raw),
  )
  .handler(async ({ data }) => {
    try {
      const env = await getEnv();
      await enforceRateLimit(env, "authAccount", getRequestHeader("cf-connecting-ip") ?? "unknown");
      const result = await finishOAuth(env, data.code, data.flowId);
      const { setSessionCookies } = await import("./supabase");
      await setSessionCookies(result.session.access_token, result.session.refresh_token, result.session.expires_in);
      return { redirect: result.redirect, email: result.user.email ?? null };
    } catch (e) {
      safeAuthError(e);
    }
  });
