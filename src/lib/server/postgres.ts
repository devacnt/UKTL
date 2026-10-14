import postgres from "postgres";
import type {} from "./env";

// SQL text is application-owned; values always travel separately as parameters.
// Tokenize literals/comments so question marks inside them are never rewritten.
function rewritePlaceholders(query: string, values: unknown[], render: (n: number) => string) {
  let index = 0;
  let numbered = false;
  let anonymous = false;
  const used = new Set<number>();
  const sql = query.replace(
    /'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?\d*/g,
    (token) => {
      if (!token.startsWith("?")) return token;
      const explicit = token.length > 1;
      numbered ||= explicit;
      anonymous ||= !explicit;
      const n = explicit ? Number(token.slice(1)) : ++index;
      if (n < 1 || n > values.length) throw new Error("SQL parameter count mismatch");
      used.add(n);
      return render(n);
    },
  );
  if ((numbered && anonymous) || used.size !== values.length) {
    throw new Error("SQL parameter count mismatch");
  }
  if (values.some((v) => v === undefined)) throw new Error("Undefined SQL parameter");
  return sql;
}

export function postgresQuery(query: string, values: unknown[]) {
  return { sql: rewritePlaceholders(query, values, (n) => `$${n}`), values };
}

/**
 * A value as a Postgres string literal of unknown type, so the server infers
 * its type from context exactly as it would for a bound parameter
 * ('42' compares with bigint, '…'::uuid casts). standard_conforming_strings is
 * on in Supabase, so doubling single quotes is the complete escape; NUL bytes
 * cannot appear in Postgres text and are refused.
 */
export function sqlLiteral(value: unknown): string {
  if (value === null) return "NULL";
  let text: string;
  if (typeof value === "string") text = value;
  else if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite SQL number");
    text = String(value);
  } else if (typeof value === "bigint" || typeof value === "boolean") text = String(value);
  else if (value instanceof Date) text = value.toISOString();
  else if (typeof value === "object") text = JSON.stringify(value);
  else throw new Error("Unsupported SQL parameter type");
  if (text.includes("\u0000")) throw new Error("NUL byte in SQL parameter");
  return `'${text.replace(/'/g, "''")}'`;
}

/** The statement with every placeholder replaced by a quoted literal (HTTPS bridge). */
export function inlineQuery(query: string, values: unknown[]) {
  const template = query.trim().replace(/;+\s*$/, "");
  // One statement per entry: a semicolon outside quotes/comments is refused.
  const outside = template.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\//g, "");
  if (outside.includes(";")) throw new Error("One SQL statement per batch entry");
  return rewritePlaceholders(template, values, (n) => sqlLiteral(values[n - 1]));
}

function safeInteger(value: string) {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error("Database integer exceeds safe range");
  return n;
}

/** Upper bound for one batch, so a stalled connection can never hang a request. */
export const OPERATION_TIMEOUT_MS = 25000;

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(label), { code: "UKTL_TIMEOUT" })), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * A log-safe description of a database failure: error class and code always;
 * the message only for connection-level failures (network, TLS, authentication,
 * timeouts), with anything resembling a URL, credential or email removed.
 * Query/data errors (SQLSTATE classes 22/23/42…) never log their message.
 */
export function describeDatabaseError(error: unknown) {
  const e = (error ?? {}) as { name?: string; code?: string; errno?: string | number; message?: string };
  const code = typeof e.code === "string" ? e.code : e.errno != null ? String(e.errno) : undefined;
  const connectionLevel =
    !code ||
    /^(08|28|53|57|3D|UKTL_|E[A-Z]+|CONNECT|CERT|ERR_TLS|SELF_SIGNED|UNABLE_TO|DEPTH_ZERO)/.test(code) ||
    /tls|ssl|certificate|handshake|socket|connect|timeout|timed out|password|authentication|tenant|ENOTFOUND|refused/i.test(e.message ?? "");
  const message = connectionLevel
    ? (e.message ?? "")
        .replace(/\b\w+:\/\/\S+/g, "[url]")
        .replace(/\S+@\S+/g, "[redacted]")
        .replace(/password=\S+/gi, "password=[redacted]")
        .slice(0, 200)
    : undefined;
  return { name: e.name ?? typeof error, code, message };
}

export function createPostgresDatabase(connectionString: string, actorId: string | null = null): D1Database {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use PostgreSQL");
  }
  // Do not let connection-string options disable certificate validation.
  url.search = "";

  async function execute(statements: Statement[]): Promise<D1Result[]> {
    // Each operation owns and closes its socket. Cloudflare Workers sockets
    // must not be reused by a different request. Use the transaction pooler.
    const client = postgres(url.toString(), {
      prepare: false,
      max: 1,
      connect_timeout: 10,
      idle_timeout: 5,
      max_lifetime: 60,
      ssl: { rejectUnauthorized: true },
      types: { epoch: { to: 20, from: [20], serialize: String, parse: safeInteger } },
    });
    try {
      const result = await withTimeout(client.begin(async (tx) => {
        await tx.unsafe("SET LOCAL search_path = recruitment, pg_catalog");
        await tx.unsafe("SELECT set_config('uktl.actor_id', $1, true)", [actorId ?? ""]);
        await tx.unsafe("SET LOCAL statement_timeout = '15s'");
        await tx.unsafe("SET LOCAL lock_timeout = '5s'");
        const results: D1Result[] = [];
        for (const statement of statements) {
          const { sql, values } = postgresQuery(statement.query, statement.values);
          const rows = await tx.unsafe(sql, values as postgres.ParameterOrJSON<never>[]);
          results.push({ success: true, results: Array.from(rows), meta: { changes: rows.count } });
        }
        return results;
      }), OPERATION_TIMEOUT_MS, "operation timed out");
      return result as D1Result[];
    } catch (error) {
      // Provider errors may contain SQL values, credentials or candidate data:
      // only the classified cause is logged, never the raw message or query.
      console.error("[db] operation failed", describeDatabaseError(error));
      throw new Error("Database operation failed");
    } finally {
      // Never let closing the socket hold the response open (Workers sockets can
      // stall on close after a failed handshake).
      await withTimeout(client.end({ timeout: 2 }), 3000, "close timed out").catch(() => undefined);
    }
  }

  class Statement implements D1PreparedStatement {
    query: string;
    values: unknown[];
    constructor(query: string, values: unknown[] = []) {
      this.query = query;
      this.values = values;
    }
    bind(...values: unknown[]) { return new Statement(this.query, values); }
    async all<T>() { return (await execute([this]))[0] as D1Result<T>; }
    async run<T>() { return this.all<T>(); }
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
      if (!statements.every((s) => s instanceof Statement)) {
        throw new Error("Cannot mix database adapters in a transaction");
      }
      return execute(statements as Statement[]) as Promise<D1Result<T>[]>;
    },
    async exec() { throw new Error("Runtime schema execution is disabled; use migrations"); },
  };
}
