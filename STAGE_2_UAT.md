# Stage 2 recruitment verification

## Latest implementation coverage — 18 September 2026

Bounded administrator refresh now persists up to 25 current profile/open-vacancy pairs per action, preserving pipeline stages and rejecting changed snapshots. A cursor continues the pass; a changing dataset can require another pass. Claude evidence review covers curated essential requirements, validates exact quotations, labels missing evidence as unknown and caches by profile/job/model/version. It does not alter rankings or decide hiring. Automated fixtures cover Construction/Technology examples but are not a client-approved evaluation set.

Matching migration `20260918212558` is applied to the current UKTL Supabase after [CI 35396364849](https://github.com/devacnt/UKTL/actions/runs/35396364849) passed. Anonymous/candidate function/table access is denied; no live Claude call or scheduler activation occurred.

Additional live tests: edit a vacancy during review and ensure stale results fail; repeat an unchanged review and verify cache reuse; refresh the full match catalog in batches; confirm consultant stages survive; review quoted evidence for relevance, fairness and unknown handling on two Construction and two Technology CVs. Agree expected scores before evaluating. Metadata-only orphan inspection is available; deletion is not authorized by an inspection result. Retention/recovery policy and malware/large-file/throughput acceptance remain release dependencies.

## Development checkpoint: durable CV processing and corrections

Implemented: private upload registration plus durable task before storage, delayed recovery if activation is interrupted, three bounded attempts, 15-minute leases, stale-result fencing, optimistic profile revision checks, editable extraction, refreshed assessment, candidate status display, administrator queue and secret-protected maintenance endpoint. No live provider or deployed browser acceptance is claimed.

Verified implementation commit: `58db92348aad4910161b89a5e6b5c86a3b7495bc`; [CI 35360043671](https://github.com/devacnt/UKTL/actions/runs/35360043671) passed both jobs. 36 unit tests and 24 browser checks passed; 14 authenticated cases remain skipped.

Automated evidence: `supabase/tests/cv_processing.sql` exercises lease recovery, token rejection, ownership, stale edits, retry delay/ceiling and function privileges. The entire live test transaction rolls back. `scripts/test-processing-postgres.ts` exercises the actual worker and persistence statements against isolated PostgreSQL with synthetic provider responses; it checks skill normalization, consultant-stage preservation, correction refresh and rejection of in-flight stale results. It makes no paid AI calls.

## When the owner connects Cloudflare

Hosting remains deferred by the owner; implementation continues. Configure the server-only database, private-storage and Anthropic secrets first. Set a randomly generated `CRON_SECRET` of at least 32 characters on the Worker and the matching GitHub Actions secret. Set repository variable `UKTL_MAINTENANCE_URL` to the exact HTTPS `/api/maintenance` URL, then `ENABLE_CV_WORKER=true` only for the intended environment after the manual worker check. No scheduler has been activated by this checkpoint. The workflow processes one task every five minutes; GitHub schedules may be delayed. This is a low-volume MVP runner, not a throughput SLA.

The administrator can process one due task at `/admin/processing` using their verified MFA account. A failed worker attempt is redacted and retried after one or five minutes. A crash on the final attempt becomes terminal after lease expiry. The original storage key remains registered, including partial-upload failures. Automatic object deletion/orphan reconciliation is still outstanding.

## System checks before user testing

- [ ] Deploy to an isolated staging project and origin; verify its secrets do not point at production.
- [ ] Candidate A/B and named administrator/consultant roles pass Stage 1 isolation and MFA checks.
- [ ] Unauthenticated or incorrect-secret `/api/maintenance` requests return 401; scheduler secrets never appear in browser traffic.
- [ ] Upload synthetic PDF, DOCX and TXT; verify private storage, queued status, actual Claude extraction and score/report completion.
- [ ] Interrupt a worker, verify 15-minute recovery and no duplicate result writes; induce provider failure and verify bounded retries and redacted errors.
- [ ] Save corrections during a worker request; the older result must not overwrite them. Save from two tabs; the stale save must fail with reload guidance.
- [ ] Re-assessment preserves consultant pipeline stages and refreshes candidate score/matches. No placeholder scores appear while processing.
- [ ] Close/expire a role; verify it is excluded from candidate discovery. Test interest, dismiss, undo and history on mobile and keyboard.
- [ ] Test deletion while processing; the deleted candidate must not be recreated.

## User tests to request when staging is available

Use synthetic or approved anonymised examples until privacy checks pass: two Construction CVs and two Technology CVs. Verify extracted contact/sector, skills with years, work history and education; correct one entry and confirm the saved values persist. Confirm report recommendations are useful and factually grounded. Test a second CV upload, interests and undo on a phone. Record tester/date, expected/actual result, screenshots and blocking issues.

Do not ask the owner to run these against an undeployed application. No Stage 2 completion claim until daily Reed sync, Claude matching/evaluation, cleanup strategy and all required deployed/UAT evidence pass.

## Upload reconciliation inspection acceptance

Read-only metadata inspection is implemented on `/admin/processing`; automatic deletion and repair remain unimplemented. Use disposable staging objects, never real candidate CVs, for these checks.

- [ ] A verified MFA administrator can inspect; a consultant, candidate and signed-out caller cannot invoke the inspection server function.
- [ ] A synthetic object older than 24 hours with no current candidate or CV-version reference appears as an unreferenced object ID, without exposing its filename/path or bytes.
- [ ] A current candidate reference or historical CV-version reference prevents an orphan finding. A recently created or recently updated object is excluded.
- [ ] An old candidate missing object metadata appears only when no pending/running processing task exists. Recent candidate writes are excluded.
- [ ] More than 100 findings display an explicit additional-results warning. Empty results are not represented as proof of file integrity; file-content and complete-inventory verification remain separate.
- [ ] Database/storage permission failures display unavailable rather than a clean report; repeated inspection is rate-limited. Inspecting changes no CV object, candidate, version or processing task (only the request-rate counter changes).
- [ ] Before implementing cleanup, define retention/approval rules, reference/lease rechecks, recoverability and audit logging. Storage mutations must use the Storage API, not metadata-table DELETE statements.

## Reed checkpoint acceptance

Use REED_SYNC.md for configuration and activation. Verify both sectors against real provider data, salary units, date parsing, repeated-import updates, preserved staff closure and expired-interest rejection. Exercise malformed detail responses, partial searches and dispatch failures. Confirm cron execution AND the final HTTP/import result. Apply the resumable migration to isolated staging first. Interrupt and reclaim a worker; prove stale workers cannot write and a retry resumes its saved cursor. Verify pause after three failures, explicit admin retry, all configured queries finishing, and same-day idling. Review search coverage and batch capacity against real Reed data; match-cache refresh remains open implementation work.

## Mandate posting, ranking and fulfilment (added 24 September 2026)

| Journey | Expected evidence |
| --- | --- |
| Post a mandate | Admin sets posted and closing dates (2 weeks / 30 / 60 / 90 days or none). After its closing date it disappears from candidate discovery and shows `expired` in Admin → Mandates. |
| Rank candidates | "Qualified candidates" lists every parsed CV scored against the mandate, highest first, with the skills/experience/seniority/location breakdown, matched and missing must-haves and CV quality. "Qualified" needs 60+ and every must-have. A consultant reviews each shortlist; scores are not decisions. |
| Add to pipeline | Selected candidates appear in the mandate pipeline at "Matched"; re-adding never resets a later stage. |
| Mark filled | The mandate shows the placed candidate, date and note, leaves discovery, and that candidate's stage becomes Placed (stage history recorded). A second fill is refused until the mandate is reopened. Editing a filled mandate keeps it filled. |
| Reopen / delete | Reopen clears the placement and sets a new closing date (past dates refused). Delete removes the mandate and its pipeline after confirmation; close or fill to keep history. Erasing the placed candidate keeps the mandate filled with no name. |
