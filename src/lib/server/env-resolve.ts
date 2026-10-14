// Dependency-free resolution of server settings outside Cloudflare Workers
// (Lovable's runtime), so the precedence rules can be unit-tested.
export function resolveServerEnv(values: Record<string, string | undefined>) {
  // Outside Workers (Lovable's server runtime) Supabase is the only backend, so
  // DATA_BACKEND defaults to it. The public URL/key may come from the Supabase
  // integration's VITE_ variables; private credentials never do.
  const fallback: Record<string, string | undefined> = {
    DATA_BACKEND: "supabase",
    SUPABASE_URL: values.VITE_SUPABASE_URL,
    // Lovable's Supabase connection names the public key SUPABASE_PUBLISHABLE_KEY.
    SUPABASE_ANON_KEY: values.SUPABASE_PUBLISHABLE_KEY ?? values.VITE_SUPABASE_ANON_KEY ?? values.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
  const keys = ["DATA_BACKEND", "DB_TRANSPORT", "DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "SITE_URL", "CRON_SECRET", "CV_SCAN_URL", "CV_SCAN_TOKEN", "ANTHROPIC_API_KEY", "PARSE_PROVIDER", "PARSE_MODEL",
    "AI_HOURLY_CALL_LIMIT", "REED_API_KEY", "RESEND_API_KEY", "GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET",
    "MICROSOFT_CALENDAR_CLIENT_ID", "MICROSOFT_CALENDAR_CLIENT_SECRET", "CALENDAR_ENCRYPTION_KEY"];
  // UKTL_-prefixed values win: Lovable Cloud manages its own SUPABASE_* variables
  // for a different (empty) project, and they must never override UKTL's.
  const PREFERRED = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SITE_URL"];
  // Once UKTL's project is named, its keys never fall back to another project's.
  const uktlProject = !!(values.UKTL_SUPABASE_URL || values.UKTL_DATABASE_URL);
  const pick = (key: string) => {
    if (!PREFERRED.includes(key)) return values[key] || fallback[key];
    const own = values[`UKTL_${key}`];
    if (own) return own;
    if (uktlProject && key !== "SITE_URL") return undefined;
    return values[key] || fallback[key];
  };
  return Object.fromEntries(keys.map((key) => [key, pick(key)])) as Record<string, string | undefined>;
}
