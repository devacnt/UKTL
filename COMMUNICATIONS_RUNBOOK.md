# Communications and calendar operations

Implementation checkpoint: 24 September 2026. Hosted acceptance remains open until the evidence below is recorded. Lovable remains the host; no Cloudflare deployment is required.

## Database and server configuration

Apply the two previously pending migrations, `20260924142748_native_calendar_media_outreach` and `20260924142808_job_lifecycle_and_fulfilment`, before the new `20260924142817_communications_calendar_sync` migration. The third migration is required for these new features. Replay and PostgreSQL regression tests must pass first. Backend-only tables deny browser database access; every application handler authenticates its own user/staff role.

Lovable's server runtime must supply `DATA_BACKEND=supabase`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL=https://uktl.lovable.app`, `RESEND_API_KEY` and `CRON_SECRET`. Never expose database/provider credentials in browser-prefixed variables. Configure the existing verified Resend sender before testing actual delivery. Missing configuration fails closed.

## Inbox and campaigns

Candidates read successfully sent messages across their own CV records at `/app/messages`, mark messages read and choose whether to receive campaigns. Opt-in defaults to false. Failed/pending delivery and internal errors are not candidate-visible. Inbox messages are included in the owner's privacy export.

Admins create drafts at `/admin/campaigns`. Preview freezes the reviewed recipient identity/email and requires typing SEND before scheduling. Only verified, opted-in accounts with parsed CVs qualify; latest eligible CV per account, optional exact mandate sector, maximum 500 recipients. A changed audience requires a new preview. The worker rechecks consent and verified email before each send. Unsubscribe links require an explicit POST confirmation; visiting a link does not change consent. Campaign tests must use synthetic accounts and an approved test mailbox, never a real bulk audience.

The durable queue claims each delivery atomically. Failed sends retry at most three times within 23 hours with the same provider idempotency key. Interrupted sends stay in `sending`: reconcile the key in provider logs before any operator repair. Never blindly reset or create a replacement job; a send may already have succeeded. Admin queue counts expose pending/failed/interrupted states. Cancellation skips remaining pending/failed sends; an in-flight request may complete.

Native appointments receive 24-hour and 1-hour reminders if booked before each due time. Cancelled/rescheduled/too-late reminders are skipped. No reminder is sent to past appointments.

## Google and Outlook

Configure Google OAuth web credentials (`GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`), Microsoft OAuth web credentials (`MICROSOFT_CALENDAR_CLIENT_ID`, `MICROSOFT_CALENDAR_CLIENT_SECRET`) and a cryptographically random 32-byte base64 `CALENDAR_ENCRYPTION_KEY` in server secrets. Losing/rotating the encryption key requires reconnecting providers. Keep secrets out of screenshots/logs.

Register exact callbacks:
- `https://uktl.lovable.app/api/calendar/callback/google`
- `https://uktl.lovable.app/api/calendar/callback/outlook`

Google requests calendar.events and calendar.events.freebusy with offline access. Microsoft requests offline_access and Calendars.ReadWrite. Complete provider consent/verification requirements in their consoles. An MFA-authenticated UKTL admin connects the firm's default calendar at `/admin/calendar`. State is single-use, user-bound and expires after ten minutes; PKCE and encrypted refresh tokens protect the connection. Only one firm connection per provider is supported.

UKTL exports generic consultation title and times, without candidate identity, CV or HR notes. External busy periods block availability. Manage consultation changes in UKTL; external edits do not change the UKTL booking record. Disconnect removes the connection and imported blocks, but leaves existing external events. Candidate erasure leaves an opaque cleanup record until the next sync removes its external event. A stale, failed or insufficient-horizon connected calendar blocks new native reservations until refreshed. Sync processes bounded batches; a backlog remains unhealthy until drained.

## Scheduler

`.github/workflows/communications.yml` runs only in devacnt/UKTL and only when repository variable `COMMUNICATIONS_ENABLED=true`. Set `COMMUNICATIONS_SITE_URL` and repository secret `COMMUNICATIONS_CRON_SECRET` matching the server. The mirror is deliberately inert to avoid duplicate schedules. GitHub schedules can be delayed; this is a five-minute target, not a delivery SLA. Configure workflow-failure notifications and monitor delivery counts/calendar freshness before production.

Authenticated POST `/api/communications?scope=google`, `scope=outlook`, and `scope=email` separates bounded provider work. Never put the bearer secret in a URL. The email scope delivers up to ten queued jobs. Enabling the worker can send previously approved queued campaigns, so inspect drafts/queue before activation.

## Required live acceptance evidence

Use an isolated hosted staging database and synthetic identities, not real candidate data. Record commit, deployment URL, timestamp, tester, pass/fail and sanitized screenshot/provider event IDs:

1. Candidate A sees only A's sent message, marks it read; candidate B and anonymous callers cannot read it. Failed messages remain hidden. Preferences persist after sign-out/sign-in.
2. Named admin with MFA previews two synthetic opted-in recipients. Opt out one before execution; only the remaining test mailbox receives the scheduled message and inbox copy. Re-run worker: no duplicate. Test cancellation and an invalid provider response.
3. Book, reschedule and cancel a synthetic native consultation. Verify reminder times, no stale reminders, one email per reminder and provider-log retry identity.
4. Connect each provider through real OAuth; verify exported generic event, external busy block, cancellation and revoked-consent failure. Confirm stale sync blocks reservations and recovery restores them.
5. Run the scanner gateway health test, a clean synthetic PDF/DOCX and the harmless EICAR antivirus test fixture in isolated staging. Verify clean intake, rejected fixture, scanner-unavailable fail-closed behavior and cross-user private-download denial. Do not upload malware.

Unit/fixture tests and skipped credential-dependent browser tests cannot substitute for these authenticated journeys. Provider credentials, an active MFA staff identity, isolated staging and a live scanner endpoint are activation prerequisites, not claims established by source code.
