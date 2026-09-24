// Access Cloudflare bindings at runtime.
// `cloudflare:workers` is only resolvable inside the Workers runtime, so we
// dynamic-import it. Other server runtimes use explicitly configured Supabase credentials.

import { createPostgresDatabase } from "./postgres";
import { createPrivateCvStorage } from "./storage";

export type AppEnv = {
  GOOGLE_CALENDAR_CLIENT_ID?: string;
  GOOGLE_CALENDAR_CLIENT_SECRET?: string;
  MICROSOFT_CALENDAR_CLIENT_ID?: string;
  MICROSOFT_CALENDAR_CLIENT_SECRET?: string;
  CALENDAR_ENCRYPTION_KEY?: string;
  DATA_BACKEND?: "d1" | "supabase";
  DATABASE_URL?: string;
  CRON_SECRET?: string;
  CV_SCAN_URL?: string;
  CV_SCAN_TOKEN?: string;
  DB: D1Database;
  CV_BUCKET: R2Bucket;
  AI: Ai;
  PARSE_PROVIDER?: string;
  PARSE_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  AI_HOURLY_CALL_LIMIT?: string;
  // Admin auth — set via: wrangler secret put ADMIN_PASSWORD_HASH / JWT_SECRET
  ADMIN_PASSWORD_HASH?: string;
  JWT_SECRET?: string;
  // Supabase — set SUPABASE_URL + SUPABASE_ANON_KEY as wrangler vars,
  //            SUPABASE_SERVICE_ROLE_KEY as wrangler secret
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  // Reed.co.uk job board API key
  REED_API_KEY?: string;
  // Resend API key for transactional email
  RESEND_API_KEY?: string;
  // Public origin of this deployment; used to build Supabase email redirect URLs
  SITE_URL?: string;
};

let cached: AppEnv | null = null;

export async function getEnv(): Promise<AppEnv> {
  if (cached) return cached;
  try {
    const mod = (await import("cloudflare:workers")) as unknown as { env: AppEnv };
    if (mod.env.DATA_BACKEND === "supabase" || mod.env.DB) {
      cached = configureBackend(mod.env);
      return cached;
    }
  } catch { /* Lovable's server runtime uses server-only environment variables. */ }
  const values = typeof process !== "undefined" ? process.env : {};
  if (values.DATA_BACKEND !== "supabase")
    throw new Error("Server backend is not configured. Set DATA_BACKEND=supabase and the server credentials.");
  const keys = ["DATA_BACKEND", "DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "SITE_URL", "CRON_SECRET", "CV_SCAN_URL", "CV_SCAN_TOKEN", "ANTHROPIC_API_KEY", "PARSE_PROVIDER", "PARSE_MODEL",
    "AI_HOURLY_CALL_LIMIT", "REED_API_KEY", "RESEND_API_KEY", "GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET",
    "MICROSOFT_CALENDAR_CLIENT_ID", "MICROSOFT_CALENDAR_CLIENT_SECRET", "CALENDAR_ENCRYPTION_KEY"];
  cached = configureBackend(Object.fromEntries(keys.map(key => [key, values[key]])) as unknown as AppEnv);
  return cached;
}

export function configureBackend(env: AppEnv): AppEnv {
  if (env.DATA_BACKEND !== "supabase") return env;
  let database: D1Database | undefined;
  let storage: R2Bucket | undefined;
  return {
    ...env,
    // Resolve credentials on use: missing data credentials must not prevent
    // Supabase sign-in or turn into a silent fallback to the legacy database.
    get DB() {
      if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
      return (database ??= createPostgresDatabase(env.DATABASE_URL));
    },
    get CV_BUCKET() {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("Private CV storage is not configured");
      }
      return (storage ??= createPrivateCvStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {url:env.CV_SCAN_URL,token:env.CV_SCAN_TOKEN}));
    },
  };
}

// D1 types shim — avoids needing @cloudflare/workers-types as a dep for
// consumers that only build the worker via wrangler.
declare global {
  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = unknown>(
      statements: D1PreparedStatement[],
    ): Promise<D1Result<T>[]>;
    exec<T = unknown>(query: string): Promise<D1ExecResult>;
  }
  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(colName?: string): Promise<T | null>;
    run<T = unknown>(): Promise<D1Result<T>>;
    all<T = unknown>(): Promise<D1Result<T>>;
    raw<T = unknown[]>(): Promise<T[]>;
  }
  interface D1Result<T = unknown> {
    results?: T[];
    success: boolean;
    meta?: Record<string, unknown>;
  }
  interface D1ExecResult {
    count: number;
    duration: number;
  }
  interface R2Bucket {
    put(
      key: string,
      value: ArrayBuffer | ReadableStream | string,
      options?: { httpMetadata?: { contentType?: string } },
    ): Promise<unknown>;
    get(key: string): Promise<R2ObjectBody | null>;
    delete(key: string): Promise<void>;
  }
  interface R2ObjectBody {
    body: ReadableStream;
    size: number;
    httpMetadata?: { contentType?: string };
    arrayBuffer(): Promise<ArrayBuffer>;
    text(): Promise<string>;
  }
  interface Ai {
    run(model: string, input: unknown): Promise<unknown>;
  }
}
