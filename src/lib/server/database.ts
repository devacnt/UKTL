import type { AppEnv } from "./env";
import { createPostgresDatabase } from "./postgres";
import { createHttpDatabase } from "./http-database";

/**
 * The application database for one request.
 * - "https" (default whenever SUPABASE_URL and the service-role key are set):
 *   batches go through Supabase's REST API; works on any host, including
 *   Lovable/Cloudflare Workers, and needs no DATABASE_URL.
 * - "postgres": a direct connection via DATABASE_URL (pooler), for hosts that
 *   can verify Supabase's certificate. Select it with DB_TRANSPORT=postgres.
 */
export function createDatabase(env: AppEnv, actorId: string | null = null): D1Database {
  const transport =
    env.DB_TRANSPORT ?? (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? "https" : "postgres");
  if (transport === "https") {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured");
    return createHttpDatabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, actorId);
  }
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return createPostgresDatabase(env.DATABASE_URL, actorId);
}
