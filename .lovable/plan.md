## Sign-up hang — findings (diagnosis only, nothing changed)

1. Server log lines (verbatim, last hour)
   - `[2026-09-28T14:39:39.375Z] [error] [ratelimit] unavailable {"scope":"authAccount","cause":"Database operation failed"}` (published site, uktl.lovable.app)
   - `[2026-09-28T14:11:45.518Z] [error] [ratelimit] unavailable {"scope":"authAccount","cause":"DATABASE_URL is not configured"}` (preview)
   - No `[auth]` lines, and no Postgres, socket, TLS or timeout text. The real cause is hidden: `postgres.ts` catches every error and rethrows only "Database operation failed".
   - The 14:39 failure has no matching request/response line, so that call may never have returned. That fits the hang.
   - Local runtime-errors/console logs have no matching entries.

2. Runtime
   - The app runs on Cloudflare Workers (workerd) with nodejs_compat. It is not Node or Deno.
   - Workers can open outbound TCP through `connect()`, and the `postgres` package uses it there. Port 6543 is not blocked by policy. But nothing in the logs proves the connection or TLS handshake to `aws-1-eu-west-1.pooler.supabase.com:6543` succeeds. The handler waits up to 10s to connect, 15s per statement and 5s on close.

3. Secrets visible to the server (names only)
   - Present: UKTL_SUPABASE_URL, UKTL_SUPABASE_ANON_KEY, UKTL_DATABASE_URL, UKTL_SUPABASE_SERVICE_ROLE_KEY (plus the managed LOVABLE_API_KEY).
   - The 14:11 preview error came before the database address was picked up. By 14:39 it was found, and the failure moved to the connection or query itself.

4. UKTL_DATABASE_URL format
   - The password has none of `@ : / # ? %` in raw form. The URL has exactly one `@`, so there is no encoding problem.

## Remaining unknowns and suggested next checks (only if you approve)
- Log the underlying error's type/code in `postgres.ts` (no values), so it shows whether this is a timeout, a TLS error, an auth failure or a missing `recruitment.rate_limits` table.
- Confirm the `recruitment` schema and `rate_limits` table exist in project fvkffdeindboirukscfq (the pooler user points at production).
- Check that the pooler password and the "transaction" mode (6543) are correct.
