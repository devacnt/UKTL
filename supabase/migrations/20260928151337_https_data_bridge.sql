-- HTTPS data bridge for hosts that cannot open verified Postgres TLS
-- connections to Supabase (Lovable runs on Cloudflare Workers, whose TLS only
-- trusts public CAs; Supabase's pooler certificate is issued by Supabase's
-- own CA). The server sends each batch to this function through PostgREST
-- with the service-role key; the batch runs in one transaction, exactly as
-- the direct Postgres adapter does.
--
-- Safety:
--  * EXECUTE is granted to service_role only (never anon/authenticated).
--  * SECURITY INVOKER: statements run with service_role's privileges, which
--    cannot drop or alter tables it does not own. Only SELECT/INSERT/UPDATE/
--    DELETE/WITH statements are accepted.
--  * Values are inlined by the server as quoted literals with a tokenizer that
--    only replaces placeholders outside quotes; see src/lib/server/postgres.ts.

-- The three auth.users columns the application reads, for service_role only.
CREATE VIEW recruitment.auth_accounts AS
  SELECT id, email, email_confirmed_at FROM auth.users;
REVOKE ALL ON recruitment.auth_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON recruitment.auth_accounts TO service_role;

CREATE FUNCTION public.uktl_run_batch(batch jsonb, actor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = recruitment, pg_catalog
AS $$
DECLARE
  q text;
  rec record;
  out jsonb := '[]'::jsonb;
  acc jsonb[];
  n bigint;
BEGIN
  IF jsonb_typeof(batch) <> 'array' OR jsonb_array_length(batch) > 200 THEN
    RAISE EXCEPTION 'Invalid batch';
  END IF;
  PERFORM set_config('uktl.actor_id', coalesce(actor::text, ''), true);
  PERFORM set_config('lock_timeout', '5s', true);
  FOR q IN SELECT value FROM jsonb_array_elements_text(batch) LOOP
    IF q !~* '^\s*(select|insert|update|delete|with)\M' THEN
      RAISE EXCEPTION 'Statement type not allowed';
    END IF;
    acc := ARRAY[]::jsonb[];
    IF q ~* '^\s*(select|with)\M' OR q ~* '\mreturning\M' THEN
      -- Row-returning statement (including top-level data-modifying CTEs).
      FOR rec IN EXECUTE q LOOP
        acc := acc || to_jsonb(rec);
      END LOOP;
      n := coalesce(array_length(acc, 1), 0);
    ELSE
      EXECUTE q;
      GET DIAGNOSTICS n = ROW_COUNT;
    END IF;
    out := out || jsonb_build_array(jsonb_build_object('rows', to_jsonb(acc), 'count', n));
  END LOOP;
  RETURN out;
END
$$;
REVOKE ALL ON FUNCTION public.uktl_run_batch(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uktl_run_batch(jsonb, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
