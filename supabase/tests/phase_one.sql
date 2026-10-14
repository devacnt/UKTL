-- Isolated CI fixtures only; all records and role changes roll back.
BEGIN;
DO $$ DECLARE candidate uuid:=gen_random_uuid(); employer uuid:=gen_random_uuid(); cv text:=gen_random_uuid()::text; n integer; BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(candidate,candidate||'@example.invalid',now()),(employer,employer||'@example.invalid',now());
 INSERT INTO recruitment.candidates(id,created_at,updated_at,status,auth_user_id,source_filename,source_r2_key,source_bytes)
 VALUES(cv,1,1,'uploaded',candidate,'fixture.pdf','cvs/'||cv||'/fixture.pdf',10);
 IF NOT EXISTS(SELECT 1 FROM recruitment.cv_versions WHERE candidate_id=cv AND version=1) THEN RAISE EXCEPTION 'Upload original not registered'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',employer,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 INSERT INTO public.account_roles VALUES(employer,'employer');
 IF EXISTS(SELECT 1 FROM recruitment.candidates WHERE id=cv) THEN RAISE EXCEPTION 'Employer read candidate'; END IF;
 IF EXISTS(SELECT 1 FROM recruitment.cv_versions WHERE candidate_id=cv) THEN RAISE EXCEPTION 'Employer read CV version'; END IF;
 BEGIN INSERT INTO public.account_roles VALUES(candidate,'employer'); RAISE EXCEPTION 'Cross-account role write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.account_roles SET role='admin' WHERE user_id=employer; RAISE EXCEPTION 'Self promotion'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE public.account_roles SET user_id=candidate WHERE user_id=employer; RAISE EXCEPTION 'Ownership reassignment'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',candidate,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 IF NOT EXISTS(SELECT 1 FROM recruitment.candidates WHERE id=cv) THEN RAISE EXCEPTION 'Candidate lost own CV'; END IF;
 INSERT INTO public.account_roles VALUES(candidate,'employer');
 IF EXISTS(SELECT 1 FROM recruitment.candidates WHERE id=cv) THEN RAISE EXCEPTION 'Employer retained candidate access'; END IF;
 UPDATE public.account_roles SET role='candidate' WHERE user_id=candidate;
 IF NOT EXISTS(SELECT 1 FROM recruitment.candidates WHERE id=cv) THEN RAISE EXCEPTION 'Candidate could not restore own access'; END IF;
 RESET ROLE;
 SET LOCAL ROLE anon;
 BEGIN PERFORM * FROM public.account_roles; RAISE EXCEPTION 'Anonymous roles exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
END $$;
ROLLBACK;
