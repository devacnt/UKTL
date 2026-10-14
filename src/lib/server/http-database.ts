import type {} from "./env";
import { describeDatabaseError, inlineQuery, OPERATION_TIMEOUT_MS } from "./postgres.ts";

/**
 * D1-compatible database over HTTPS: each batch is sent to the
 * `public.uktl_run_batch` function through Supabase's REST API with the
 * service-role key and runs in one transaction, like the direct Postgres
 * adapter. Used where the host cannot open verified TLS connections to the
 * Postgres pooler (Lovable on Cloudflare Workers). See migration
 * 20260928150251_https_data_bridge.sql.
 */
export function createHttpDatabase(supabaseUrl: string, serviceKey: string, actorId: string | null = null): D1Database {
  const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/uktl_run_batch`;
  // New secret keys (sb_secret_…) are opaque API keys, not bearer JWTs.
  const headers: Record<string, string> = { apikey: serviceKey, "Content-Type": "application/json", Accept: "application/json" };
  if (!serviceKey.startsWith("sb_")) headers.Authorization = `Bearer ${serviceKey}`;

  async function execute(statements: Statement[]): Promise<D1Result[]> {
    const batch = statements.map((s) => inlineQuery(s.query, s.values));
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ batch, actor: actorId }),
        signal: AbortSignal.timeout(OPERATION_TIMEOUT_MS),
      });
    } catch (error) {
      console.error("[db] operation failed", describeDatabaseError(error));
      throw new Error("Database operation failed");
    }
    const text = await response.text();
    if (!response.ok) {
      let detail: { code?: string; message?: string } = {};
      try {
        detail = JSON.parse(text);
      } catch {
        /* non-JSON gateway error */
      }
      console.error(
        "[db] operation failed",
        describeDatabaseError(Object.assign(new Error(detail.message ?? `HTTP ${response.status}`), { code: detail.code ?? `HTTP_${response.status}` })),
      );
      throw new Error("Database operation failed");
    }
    const results = JSON.parse(text) as { rows: Record<string, unknown>[] | null; count: number }[];
    return results.map((r) => ({ success: true, results: r.rows ?? [], meta: { changes: Number(r.count) } }));
  }

  class Statement implements D1PreparedStatement {
    query: string;
    values: unknown[];
    constructor(query: string, values: unknown[] = []) {
      this.query = query;
      this.values = values;
    }
    bind(...values: unknown[]) {
      return new Statement(this.query, values);
    }
    async all<T>() {
      return (await execute([this]))[0] as D1Result<T>;
    }
    async run<T>() {
      return this.all<T>();
    }
    async first<T>(column?: string): Promise<T | null> {
      const row = (await this.all<Record<string, unknown>>()).results?.[0];
      return (row ? (column ? row[column] : row) : null) as T | null;
    }
    async raw<T = unknown[]>(): Promise<T[]> {
      const result = await this.all<Record<string, unknown>>();
      return (result.results ?? []).map((row) => Object.values(row) as T);
    }
  }

  return {
    prepare: (query) => new Statement(query),
    async batch<T>(statements: D1PreparedStatement[]) {
      if (!statements.every((s) => s instanceof Statement)) throw new Error("Cannot mix database adapters in a transaction");
      return execute(statements as Statement[]) as Promise<D1Result<T>[]>;
    },
    async exec() {
      throw new Error("Runtime schema execution is disabled; use migrations");
    },
  };
}
