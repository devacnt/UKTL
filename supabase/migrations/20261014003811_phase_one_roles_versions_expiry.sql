-- Candidate/employer is a self-service account type, never a staff grant.
CREATE TABLE public.account_roles (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('candidate','employer'))
);
ALTER TABLE public.account_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.account_roles TO authenticated;
GRANT ALL ON public.account_roles TO service_role;
CREATE POLICY own_account_role_read ON public.account_roles FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
CREATE POLICY own_account_role_insert ON public.account_roles FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=user_id);
CREATE POLICY own_account_role_update ON public.account_roles FOR UPDATE TO authenticated USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
-- A candidate may become an employer, but that must not expose any candidate CV.
CREATE POLICY employer_candidate_boundary ON recruitment.candidates AS RESTRICTIVE FOR SELECT TO authenticated
 USING ((SELECT uktl_private.staff_role()) IN ('admin','consultant') OR NOT EXISTS (
 SELECT 1 FROM public.account_roles WHERE user_id=(SELECT auth.uid()) AND role='employer'));

-- Every immutable upload has its own candidate assessment record and version.
-- The account history orders all those records; previous originals are retained.
CREATE FUNCTION recruitment.register_cv_version() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.source_r2_key IS NOT NULL AND NEW.source_bytes > 0 THEN
 INSERT INTO recruitment.cv_versions(id,candidate_id,version,storage_key,filename,content_type,size_bytes,created_at)
 VALUES(NEW.id||':original',NEW.id,1,NEW.source_r2_key,COALESCE(NEW.source_filename,'CV'),
 CASE WHEN lower(NEW.source_filename) LIKE '%.pdf' THEN 'application/pdf'
 WHEN lower(NEW.source_filename) LIKE '%.docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ELSE 'text/plain' END,
 NEW.source_bytes,NEW.created_at);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION recruitment.register_cv_version() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER register_cv_version AFTER INSERT ON recruitment.candidates FOR EACH ROW EXECUTE FUNCTION recruitment.register_cv_version();

-- Never extend an imported vacancy beyond 30 days from first import/publication.
UPDATE recruitment.jobs SET expiry_date=LEAST(
 COALESCE(expiry_date,'9999-12-31'),
 (LEAST(COALESCE(posted_date::date,(to_timestamp(created_at/1000.0) AT TIME ZONE 'UTC')::date),
 (to_timestamp(created_at/1000.0) AT TIME ZONE 'UTC')::date)+30)::text)
 WHERE source='reed';
NOTIFY pgrst,'reload schema';
