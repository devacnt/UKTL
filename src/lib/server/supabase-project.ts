// Dependency-free so it can be unit-tested and used before any client is built.

/** Project ref from https://<ref>.supabase.co */
export function supabaseUrlRef(url: string | undefined) {
  try {
    const host = new URL(url ?? "").hostname;
    return /^([a-z0-9]{20})\.supabase\.co$/.exec(host)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Project ref from a direct (db.<ref>.supabase.co) or pooler (postgres.<ref>@…pooler.supabase.com) URL. */
export function databaseUrlRef(url: string | undefined) {
  try {
    const u = new URL(url ?? "");
    return (
      /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(u.hostname)?.[1] ??
      /^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(u.username))?.[1] ??
      null
    );
  } catch {
    return null;
  }
}

/**
 * Sign-in (SUPABASE_URL) and data (DATABASE_URL) must be the same Supabase
 * project; otherwise candidates would be created in one project and their
 * records stored in another. Fails closed when both refs are recognisable
 * and differ.
 */
export function assertSameSupabaseProject(env: { SUPABASE_URL?: string; DATABASE_URL?: string }) {
  const auth = supabaseUrlRef(env.SUPABASE_URL);
  const data = databaseUrlRef(env.DATABASE_URL);
  if (auth && data && auth !== data)
    throw new Error(`SUPABASE_URL (${auth}) and DATABASE_URL (${data}) point at different Supabase projects`);
}
