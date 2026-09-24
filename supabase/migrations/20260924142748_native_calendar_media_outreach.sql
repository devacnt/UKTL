-- Native consultation calendar (replaces the Calendly embed), FAQ written answers
-- and uploaded media, and a logged candidate outreach channel.
-- Calendly-era tables/columns stay for history: migrations are append-only.

-- ── Calendar configuration ───────────────────────────────────────────────────
-- One firm, one consultation calendar. Times are wall-clock Europe/London.
CREATE TABLE recruitment.booking_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 slot_minutes integer NOT NULL DEFAULT 30 CHECK (slot_minutes IN (15,20,30,45,60,90)),
 buffer_minutes integer NOT NULL DEFAULT 10 CHECK (buffer_minutes BETWEEN 0 AND 120),
 min_notice_hours integer NOT NULL DEFAULT 24 CHECK (min_notice_hours BETWEEN 0 AND 336),
 max_days_ahead integer NOT NULL DEFAULT 30 CHECK (max_days_ahead BETWEEN 1 AND 180),
 daily_limit integer NOT NULL DEFAULT 8 CHECK (daily_limit BETWEEN 1 AND 48),
 location text NOT NULL DEFAULT 'Video call. Your consultant emails the joining link before the appointment.' CHECK (length(location) BETWEEN 1 AND 300),
 updated_at bigint NOT NULL DEFAULT 0
);
INSERT INTO recruitment.booking_settings(id) VALUES (true);

-- Weekly opening hours. No default hours are seeded: staff set real availability.
CREATE TABLE recruitment.availability_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7), -- ISO: 1 = Monday
 start_minute integer NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
 end_minute integer NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
 created_at bigint NOT NULL,
 CHECK (end_minute > start_minute)
);
CREATE INDEX availability_rules_day ON recruitment.availability_rules(weekday, start_minute);

-- Holidays, leave and other closures.
CREATE TABLE recruitment.availability_blocks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 starts_at bigint NOT NULL,
 ends_at bigint NOT NULL,
 reason text CHECK (length(reason) <= 200),
 created_at bigint NOT NULL,
 CHECK (ends_at > starts_at)
);
CREATE INDEX availability_blocks_range ON recruitment.availability_blocks(ends_at, starts_at);

-- ── Native bookings ──────────────────────────────────────────────────────────
ALTER TABLE recruitment.bookings ADD COLUMN source text NOT NULL DEFAULT 'request'
 CHECK (source IN ('request','calendly','native'));
UPDATE recruitment.bookings SET source='calendly' WHERE provider_invitee_uri IS NOT NULL;
ALTER TABLE recruitment.bookings ADD COLUMN query_id text REFERENCES recruitment.hr_queries(id) ON DELETE SET NULL;
ALTER TABLE recruitment.bookings ADD COLUMN location text CHECK (length(location) <= 300);
ALTER TABLE recruitment.bookings ADD COLUMN cancelled_at bigint;
ALTER TABLE recruitment.bookings ADD COLUMN cancelled_by text CHECK (cancelled_by IN ('candidate','staff'));
ALTER TABLE recruitment.bookings ADD COLUMN rescheduled_to text REFERENCES recruitment.bookings(id) ON DELETE SET NULL;
ALTER TABLE recruitment.bookings ADD CONSTRAINT native_booking_shape CHECK (
 source <> 'native' OR (auth_user_id IS NOT NULL AND starts_at IS NOT NULL AND ends_at > starts_at AND status IN ('confirmed','cancelled'))
);
-- The database, not only the application, refuses double-booked native slots.
ALTER TABLE recruitment.bookings ADD CONSTRAINT native_booking_no_overlap
 EXCLUDE USING gist (int8range(starts_at, ends_at) WITH &&) WHERE (source = 'native' AND status = 'confirmed');
CREATE INDEX bookings_native_upcoming ON recruitment.bookings(starts_at) WHERE source = 'native' AND status = 'confirmed';
CREATE INDEX bookings_query_idx ON recruitment.bookings(query_id);
CREATE INDEX bookings_rescheduled_to_idx ON recruitment.bookings(rescheduled_to);

-- ── FAQ written answers and uploaded media ───────────────────────────────────
ALTER TABLE recruitment.faq_topics ADD COLUMN answer text CHECK (length(answer) <= 20000);
ALTER TABLE recruitment.faq_topics ADD COLUMN thumbnail_key text CHECK (thumbnail_key ~ '^videos/[a-zA-Z0-9_./-]+\.(jpg|png|webp)$');
ALTER TABLE recruitment.faq_topics ADD COLUMN updated_at bigint;
-- Any change to what candidates read or watch withdraws approval, unless the same
-- statement is itself an approval (sets a new reviewed_at).
CREATE OR REPLACE FUNCTION recruitment.invalidate_faq_review() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF ROW(NEW.title,NEW.category,NEW.keywords,NEW.sector_tag,NEW.answer,NEW.transcript,NEW.video_key,NEW.captions_key,NEW.thumbnail_key)
    IS DISTINCT FROM ROW(OLD.title,OLD.category,OLD.keywords,OLD.sector_tag,OLD.answer,OLD.transcript,OLD.video_key,OLD.captions_key,OLD.thumbnail_key)
    AND NEW.reviewed_at IS NOT DISTINCT FROM OLD.reviewed_at THEN
  NEW.reviewed_at=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION recruitment.invalidate_faq_review() FROM PUBLIC,anon,authenticated;

-- Accepted upload formats: MP4/WebM video, WebVTT captions, JPEG/PNG/WebP posters.
UPDATE storage.buckets
 SET allowed_mime_types = ARRAY['video/mp4','video/webm','text/vtt','image/jpeg','image/png','image/webp'],
     file_size_limit = 104857600
 WHERE id = 'uktl-videos';

-- ── Candidate outreach log ───────────────────────────────────────────────────
CREATE TABLE recruitment.candidate_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 candidate_id text NOT NULL REFERENCES recruitment.candidates(id) ON DELETE CASCADE,
 job_id text REFERENCES recruitment.jobs(id) ON DELETE SET NULL,
 sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 template text NOT NULL CHECK (template IN ('role_intro','interview_invite','follow_up','not_progressing','custom')),
 to_email text NOT NULL CHECK (length(to_email) <= 320),
 subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 200),
 body text NOT NULL CHECK (length(body) BETWEEN 1 AND 8000),
 status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','sent','failed','skipped')),
 error text CHECK (length(error) <= 300),
 created_at bigint NOT NULL,
 updated_at bigint NOT NULL
);
CREATE INDEX candidate_messages_candidate ON recruitment.candidate_messages(candidate_id, created_at DESC);
CREATE INDEX candidate_messages_job ON recruitment.candidate_messages(job_id);
CREATE INDEX candidate_messages_sender ON recruitment.candidate_messages(sent_by);
CREATE INDEX candidate_messages_recent ON recruitment.candidate_messages(created_at);

-- ── Backend-only access, audit ───────────────────────────────────────────────
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['booking_settings','availability_rules','availability_blocks','candidate_messages'] LOOP
  EXECUTE format('ALTER TABLE recruitment.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON recruitment.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON recruitment.%I TO service_role',t);
  EXECUTE format('CREATE POLICY backend_service_access ON recruitment.%I TO service_role USING (true) WITH CHECK (true)',t);
  EXECUTE format('CREATE TRIGGER audit_mutation AFTER INSERT OR UPDATE OR DELETE ON recruitment.%I FOR EACH ROW EXECUTE FUNCTION recruitment.audit_mutation()',t);
 END LOOP;
END $$;

-- ── Atomic reservation ───────────────────────────────────────────────────────
-- The server validates the requested time against the weekly rules first; this
-- function serialises every reservation so buffers, closures, the daily limit and
-- the per-candidate limit are re-checked under one lock. A reschedule cancels the
-- old appointment in the same transaction and is undone if the new slot fails.
CREATE FUNCTION recruitment.reserve_consultation(
 booking_id text, owner uuid, owner_email text, owner_name text, phone text, topic text, note text,
 query text, slot_start bigint, slot_end bigint, buffer_ms bigint, day_start bigint, day_end bigint,
 day_limit integer, place text, replaces text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t bigint := floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 IF slot_end <= slot_start OR slot_start <= t OR buffer_ms < 0 OR day_end <= day_start
    OR slot_start < day_start OR slot_start >= day_end THEN RETURN 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock(492741129);
 BEGIN
  IF replaces IS NOT NULL THEN
   UPDATE recruitment.bookings SET status='cancelled', cancelled_at=t, cancelled_by='candidate'
    WHERE id=replaces AND auth_user_id=owner AND source='native' AND status='confirmed' AND starts_at>t;
   IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM recruitment.availability_blocks WHERE starts_at<slot_end AND ends_at>slot_start) THEN
   RAISE EXCEPTION 'unavailable';
  END IF;
  IF EXISTS(SELECT 1 FROM recruitment.bookings WHERE source='native' AND status='confirmed'
            AND starts_at<slot_end+buffer_ms AND ends_at>slot_start-buffer_ms) THEN
   RAISE EXCEPTION 'slot_taken';
  END IF;
  IF (SELECT count(*) FROM recruitment.bookings WHERE source='native' AND status='confirmed'
      AND starts_at>=day_start AND starts_at<day_end)>=day_limit THEN
   RAISE EXCEPTION 'day_full';
  END IF;
  IF (SELECT count(*) FROM recruitment.bookings WHERE source='native' AND status='confirmed'
      AND auth_user_id=owner AND starts_at>t)>=2 THEN
   RAISE EXCEPTION 'limit';
  END IF;
  INSERT INTO recruitment.bookings(id,created_at,user_email,auth_user_id,topic_area,contact_name,contact_email,
   contact_phone,status,notes,notification_status,source,query_id,starts_at,ends_at,location)
  VALUES(booking_id,t,owner_email,owner,topic,owner_name,owner_email,phone,'confirmed',note,'skipped','native',
   query,slot_start,slot_end,place);
  IF replaces IS NOT NULL THEN
   UPDATE recruitment.bookings SET rescheduled_to=booking_id WHERE id=replaces;
  END IF;
  INSERT INTO recruitment.booking_events(id,booking_id,payload,created_at)
  VALUES(booking_id||':confirmed',booking_id,
   jsonb_build_object('type',CASE WHEN replaces IS NULL THEN 'confirmed' ELSE 'rescheduled' END,'replaces',replaces),t);
  RETURN 'booked';
 EXCEPTION
  WHEN raise_exception THEN RETURN SQLERRM;
  WHEN exclusion_violation THEN RETURN 'slot_taken';
 END;
END $$;
REVOKE ALL ON FUNCTION recruitment.reserve_consultation(text,uuid,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION recruitment.reserve_consultation(text,uuid,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,integer,text,text) TO service_role;
