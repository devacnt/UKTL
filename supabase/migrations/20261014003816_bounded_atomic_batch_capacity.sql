-- Preserve atomic campaign/CV batches larger than 200 statements. Service-only, bounded to 5000 statements and 8 MiB. Never split authorization guards from writes.
CREATE OR REPLACE FUNCTION public.uktl_run_batch(batch jsonb, actor uuid DEFAULT NULL)
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
  IF jsonb_typeof(batch) <> 'array' OR jsonb_array_length(batch) > 5000 OR octet_length(batch::text) > 8388608 THEN
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
