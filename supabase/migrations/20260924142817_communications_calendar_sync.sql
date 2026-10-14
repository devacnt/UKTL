-- Candidate inbox, consent-based campaigns, reminder queue and staff calendars.
ALTER TABLE recruitment.candidate_messages ADD COLUMN read_at bigint;
ALTER TABLE recruitment.candidate_messages DROP CONSTRAINT candidate_messages_status_check;
ALTER TABLE recruitment.candidate_messages ADD CONSTRAINT candidate_messages_status_check CHECK(status IN('pending','sending','sent','failed','skipped'));
CREATE TABLE recruitment.communication_preferences (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 campaigns_enabled boolean NOT NULL DEFAULT false,
 unsubscribe_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),
 updated_at bigint NOT NULL
);
CREATE TABLE recruitment.email_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subject text NOT NULL CHECK(length(subject) BETWEEN 3 AND 200 AND subject !~ '[\r\n]'),
 body text NOT NULL CHECK(length(body) BETWEEN 20 AND 8000),
 sector text NOT NULL DEFAULT '' CHECK(length(sector)<=100),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','scheduled','completed','cancelled')),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at bigint NOT NULL, scheduled_at bigint, approved_at bigint,
 recipient_count integer NOT NULL DEFAULT 0 CHECK(recipient_count BETWEEN 0 AND 500)
);
ALTER TABLE recruitment.candidate_messages ADD COLUMN campaign_id uuid REFERENCES recruitment.email_campaigns(id) ON DELETE SET NULL;
ALTER TABLE recruitment.candidate_messages ADD COLUMN recipient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX candidate_messages_campaign_recipient ON recruitment.candidate_messages(campaign_id,recipient_user_id) WHERE campaign_id IS NOT NULL;
CREATE TABLE recruitment.communication_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN('campaign','reminder')),
 reference text NOT NULL,
 message_id uuid REFERENCES recruitment.candidate_messages(id) ON DELETE CASCADE,
 booking_id text REFERENCES recruitment.bookings(id) ON DELETE CASCADE,
 booking_start bigint,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','sent','failed','skipped')),
 attempts integer NOT NULL DEFAULT 0,
 due_at bigint NOT NULL, first_attempt_at bigint, attempted_at bigint, completed_at bigint,
 last_error text CHECK(length(last_error)<=300),
 UNIQUE(kind,reference),
 CHECK((kind='campaign' AND message_id IS NOT NULL AND booking_id IS NULL) OR (kind='reminder' AND booking_id IS NOT NULL AND booking_start IS NOT NULL AND message_id IS NULL))
);
CREATE INDEX communication_jobs_due ON recruitment.communication_jobs(due_at) WHERE status IN('pending','failed');
CREATE INDEX communication_jobs_message ON recruitment.communication_jobs(message_id);
CREATE INDEX communication_jobs_booking ON recruitment.communication_jobs(booking_id);
CREATE INDEX email_campaigns_creator ON recruitment.email_campaigns(created_by);
CREATE INDEX candidate_messages_recipient ON recruitment.candidate_messages(recipient_user_id);

CREATE TABLE recruitment.calendar_connections (
 provider text PRIMARY KEY CHECK(provider IN('google','outlook')),
 connected_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 refresh_token_encrypted text NOT NULL,
 connected_at bigint NOT NULL,
 last_sync_at bigint, busy_until bigint,
 last_error text CHECK(length(last_error)<=300),
 lease_token uuid, lease_until bigint
);
CREATE INDEX calendar_connections_owner ON recruitment.calendar_connections(connected_by);
CREATE TABLE recruitment.calendar_oauth_states (
 state_hash text PRIMARY KEY,
 provider text NOT NULL CHECK(provider IN('google','outlook')),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 verifier_encrypted text NOT NULL,
 expires_at bigint NOT NULL
);
CREATE INDEX calendar_oauth_states_owner ON recruitment.calendar_oauth_states(user_id);
CREATE TABLE recruitment.calendar_event_links (
 provider text NOT NULL REFERENCES recruitment.calendar_connections(provider) ON DELETE CASCADE,
 booking_id text REFERENCES recruitment.bookings(id) ON DELETE SET NULL,
 event_key text NOT NULL,
 event_id text,
 synced_signature text,
 first_attempt_at bigint,
 last_error text,
 PRIMARY KEY(provider,event_key),
 UNIQUE(provider,booking_id)
);
CREATE INDEX calendar_event_links_booking ON recruitment.calendar_event_links(booking_id);
ALTER TABLE recruitment.availability_blocks ADD COLUMN calendar_provider text REFERENCES recruitment.calendar_connections(provider) ON DELETE CASCADE;
CREATE INDEX availability_blocks_provider ON recruitment.availability_blocks(calendar_provider);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['communication_preferences','email_campaigns','communication_jobs','calendar_connections','calendar_oauth_states','calendar_event_links'] LOOP
  EXECUTE format('ALTER TABLE recruitment.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON recruitment.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON recruitment.%I TO service_role',t);
  EXECUTE format('CREATE POLICY backend_service_access ON recruitment.%I TO service_role USING(true) WITH CHECK(true)',t);
  EXECUTE format('CREATE TRIGGER audit_mutation AFTER INSERT OR UPDATE OR DELETE ON recruitment.%I FOR EACH ROW EXECUTE FUNCTION recruitment.audit_mutation()',t);
 END LOOP;
END $$;

-- Native reservations must not rely on an expired or failed imported calendar.
-- Trigger shares the existing reservation lock and also covers any service-role inserts.
CREATE FUNCTION recruitment.check_connected_calendar_freshness() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.source='native' AND NEW.status='confirmed' THEN
  PERFORM pg_advisory_xact_lock(492741129);
  IF EXISTS(SELECT 1 FROM recruitment.calendar_connections WHERE last_sync_at IS NULL
    OR last_sync_at < floor(extract(epoch FROM clock_timestamp())*1000)-600000
    OR busy_until IS NULL OR busy_until<NEW.ends_at OR last_error IS NOT NULL) THEN
   RAISE EXCEPTION 'calendar_unavailable';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION recruitment.check_connected_calendar_freshness() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER connected_calendar_freshness BEFORE INSERT OR UPDATE OF starts_at,ends_at,status ON recruitment.bookings
 FOR EACH ROW EXECUTE FUNCTION recruitment.check_connected_calendar_freshness();
