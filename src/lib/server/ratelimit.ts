import type { AppEnv } from "./env";

/**
 * Durable fixed-window rate limiter backed by D1.
 *
 * Workers are stateless and horizontally scaled, so an in-memory counter is
 * not enforceable in production — the window lives in the `rate_limits` table
 * (migration 0009) and the increment is a single atomic UPSERT ... RETURNING.
 */
export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export type RateLimitRule = { limit: number; windowMs: number };

export const RATE_LIMITS = {
  privacy: { limit: 10, windowMs: 60 * 60 * 1000 },
  hrQuestion: { limit: 30, windowMs: 60 * 60 * 1000 },
  hrSource: { limit: 20, windowMs: 60 * 60 * 1000 },
  videoPlay: { limit: 100, windowMs: 60 * 60 * 1000 },
  bookingIntent: { limit: 10, windowMs: 60 * 60 * 1000 },
  matchReview: { limit: 20, windowMs: 60 * 60 * 1000 },
  matchRefresh: { limit: 60, windowMs: 60 * 60 * 1000 },
  uploadReconciliation: { limit: 12, windowMs: 60 * 60 * 1000 },
  /** Costly: two Anthropic calls per upload. */
  cvWorker: { limit: 60, windowMs: 60 * 60 * 1000 },
  cvUpload: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** Costly: one Anthropic call per question. */
  aiEscalation: { limit: 20, windowMs: 60 * 60 * 1000 },
  /** Credential stuffing defence. */
  adminLogin: { limit: 20, windowMs: 15 * 60 * 1000 },
  authAccount: { limit: 20, windowMs: 15 * 60 * 1000 },
  authRecovery: { limit: 5, windowMs: 60 * 60 * 1000 },
  staffMfa: { limit: 20, windowMs: 15 * 60 * 1000 },
  /** Public forms — spam defence. */
  publicForm: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** Outbound Reed sync (admin-triggered but bulk). */
  reedSync: { limit: 12, windowMs: 60 * 60 * 1000 },
  /** Staff email to candidates. */
  candidateOutreach: { limit: 60, windowMs: 60 * 60 * 1000 },
  /** Bulk personal-data downloads. */
  dataExport: { limit: 30, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

export async function consumeRateLimit(
  env: AppEnv,
  scope: keyof typeof RATE_LIMITS,
  identity: string,
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[scope];
  const bucket = `${scope}:${identity}`.slice(0, 200);
  const now = Date.now();

  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(bucket) DO UPDATE SET
       window_start = CASE WHEN ?2 - rate_limits.window_start >= ?3 THEN ?2 ELSE rate_limits.window_start END,
       count        = CASE WHEN ?2 - rate_limits.window_start >= ?3 THEN 1 ELSE rate_limits.count + 1 END
     RETURNING count, window_start`,
  )
    .bind(bucket, now, rule.windowMs)
    .first<{ count: number; window_start: number }>();

  // A missing row means the write failed; fail closed rather than allow
  // unbounded spend on a paid upstream.
  if (!row) return { allowed: false, retryAfterSeconds: 60 };

  if (row.count > rule.limit) {
    const resetAt = row.window_start + rule.windowMs;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  }
  return { allowed: true, remaining: rule.limit - row.count };
}

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(
      `Too many requests — please try again in ${
        retryAfterSeconds >= 60
          ? `${Math.ceil(retryAfterSeconds / 60)} minute(s)`
          : `${retryAfterSeconds} second(s)`
      }.`,
    );
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function enforceRateLimit(
  env: AppEnv,
  scope: keyof typeof RATE_LIMITS,
  identity: string,
): Promise<void> {
  let result: RateLimitResult;
  try {
    result = await consumeRateLimit(env, scope, identity);
  } catch (e) {
    // Fail closed, but never show database/configuration details to a visitor.
    console.error("[ratelimit] unavailable", { scope, cause: e instanceof Error ? e.message : "unknown" });
    throw new Error("This is temporarily unavailable. Please try again shortly.");
  }
  if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds);
}

/** Best-effort housekeeping so the table cannot grow without bound. */
export async function pruneRateLimits(env: AppEnv): Promise<void> {
  try {
    await env.DB.prepare(`DELETE FROM rate_limits WHERE window_start < ?`)
      .bind(Date.now() - 24 * 60 * 60 * 1000)
      .run();
  } catch {
    /* housekeeping only */
  }
}
