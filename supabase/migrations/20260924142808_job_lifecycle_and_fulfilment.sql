-- Mandate lifecycle: a vacancy can be filled by a named candidate, and staff
-- record who filled it, when, and a short note. Duration uses the existing
-- posted_date/expiry_date (YYYY-MM-DD) columns.
ALTER TABLE recruitment.jobs DROP CONSTRAINT jobs_status_check;
ALTER TABLE recruitment.jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('open','closed','filled'));
ALTER TABLE recruitment.jobs ADD COLUMN filled_candidate_id text REFERENCES recruitment.candidates(id) ON DELETE SET NULL;
ALTER TABLE recruitment.jobs ADD COLUMN filled_at bigint;
ALTER TABLE recruitment.jobs ADD COLUMN filled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE recruitment.jobs ADD COLUMN filled_note text CHECK (length(filled_note) <= 1000);
ALTER TABLE recruitment.jobs ADD COLUMN updated_at bigint;
-- A filled mandate always has a fill time; the candidate reference may later be
-- cleared by erasure, which must not block the candidate's deletion.
ALTER TABLE recruitment.jobs ADD CONSTRAINT jobs_filled_shape CHECK (
 (status = 'filled') = (filled_at IS NOT NULL)
);
ALTER TABLE recruitment.jobs ADD CONSTRAINT jobs_duration_shape CHECK (
 expiry_date IS NULL OR expiry_date ~ '^\d{4}-\d{2}-\d{2}'
);
CREATE INDEX jobs_filled_candidate_idx ON recruitment.jobs(filled_candidate_id);
CREATE INDEX jobs_filled_by_idx ON recruitment.jobs(filled_by);

-- Fill atomically: the job becomes 'filled', the placed candidate's pipeline row
-- moves to 'placed' (created if staff placed someone not yet in the pipeline),
-- and every other active pipeline row for the job is left for staff to close.
CREATE FUNCTION recruitment.fill_job(
 p_job text, p_candidate text, p_actor uuid, p_note text,
 p_score bigint, p_skills bigint, p_experience bigint, p_seniority bigint, p_location bigint,
 p_matched text, p_missing text, p_reasoning text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t bigint := floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 PERFORM 1 FROM recruitment.jobs WHERE id=p_job FOR UPDATE;
 IF NOT FOUND THEN RETURN 'job_not_found'; END IF;
 PERFORM 1 FROM recruitment.candidates WHERE id=p_candidate FOR SHARE;
 IF NOT FOUND THEN RETURN 'candidate_not_found'; END IF;
 IF EXISTS(SELECT 1 FROM recruitment.jobs WHERE id=p_job AND status='filled') THEN RETURN 'already_filled'; END IF;
 INSERT INTO recruitment.matches(candidate_id,job_id,score,skills_overlap,experience_fit,seniority_fit,location_fit,
   matched_skills,missing_skills,reasoning,computed_at,stage,stage_updated_at)
 VALUES(p_candidate,p_job,p_score,p_skills,p_experience,p_seniority,p_location,p_matched,p_missing,p_reasoning,t,'placed',t)
 ON CONFLICT(candidate_id,job_id) DO UPDATE SET stage='placed',stage_updated_at=t;
 UPDATE recruitment.jobs SET status='filled',filled_candidate_id=p_candidate,filled_at=t,filled_by=p_actor,
   filled_note=NULLIF(btrim(p_note),''),updated_at=t WHERE id=p_job;
 RETURN 'filled';
END $$;
REVOKE ALL ON FUNCTION recruitment.fill_job(text,text,uuid,text,bigint,bigint,bigint,bigint,bigint,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION recruitment.fill_job(text,text,uuid,text,bigint,bigint,bigint,bigint,bigint,text,text,text) TO service_role;
