# Astra — pick-up note: mandate posting, ranking and fulfilment (24 September 2026)

**Keep this file until step 3 confirms the merge in both repositories and both pending migrations in the database. Then delete it (step 4).**

## Where things stand

- Your handoff merge is verified. devacnt and JSHrs `main` are both at **`dcfae07`** (tree `5ee0bff…`), and your review commit is included.
- **Waiting:** branch `claude/cv-parsing-dashboard-design-MlDEc` on `JSHrs/uktl-`. It is **two commits directly on top of `dcfae07`**: the mandate work and the commit adding this note. It **fast-forwards**.
- **Not yet in any database, per your note:** `20260924122319_native_calendar_media_outreach`. This branch adds `20260924125857_job_lifecycle_and_fulfilment`.

## What the owner asked for

> Admin should be able to post jobs and get a list of qualified candidates from the database that fit the role. Candidates should be ranked and scored on how well they fit the job. Jobs can be modified, deleted and given a duration, or marked as fulfilled with the candidate who filled them.

## What changed

**Duration**
- The mandate form has "Posted on" and "Closes on" dates, with presets: 2 weeks, 30, 60 or 90 days, or no closing date. These use the existing `posted_date`/`expiry_date` columns.
- Past the closing date, a mandate leaves candidate discovery, which already filtered on `expiry_date`.
- Admin → Mandates shows `open / expired / closed / filled`, plus the closing date or who filled it.

**Qualified candidates** (`/admin/jobs/:id`, panel under the form; new mandates open straight onto it)
- `server/job-tools.ts` `rankCandidatesForJob` scores **every parsed CV in the database**, newest 5,000, using the existing rules-based `scoreMatch` (skills 50 / experience 20 / seniority 20 / location 10).
- Ranking order: score, then must-have coverage, then CV quality. The id keeps the order stable.
- Each row shows the breakdown bars, matched and missing must-haves, CV quality and pipeline stage, with "Why this score" expandable.
- **Qualified** means a score of at least 60 **and** every must-have skill present.
- Filters: minimum score, qualified only.
- Unreadable profiles are counted, never guessed.
- "Add to pipeline" (bulk) upserts match rows and **never resets an existing stage**.

**Mark filled / reopen / delete**
- `recruitment.fill_job()` (SECURITY INVOKER, service_role only) locks the mandate and sets `status='filled'`, `filled_candidate_id/at/by/note`. In the same transaction it upserts the candidate's match at `placed`, and your stage-history trigger records it.
- A second fill is refused. `updateJob` keeps a filled mandate filled.
- Reopen clears the placement and takes a new closing date; past dates are refused.
- Erasing the placed candidate sets the reference to NULL, so the mandate stays filled.
- Delete still needs admin confirmation, and the dialog now says the pipeline is deleted too.

**Permissions**
- Ranking and add-to-pipeline: `requireStaff`.
- Fill and reopen: `requireAdmin` + `requireViewer` for the actor.
- Fill is Supabase-only.

**Migration `20260924125857_job_lifecycle_and_fulfilment.sql`** (created with `supabase migration new`)
- Swaps `jobs_status_check` to `open|closed|filled`.
- Adds `filled_*`/`updated_at` columns.
- Adds the check `(status='filled') = (filled_at IS NOT NULL)`.
- Adds an ISO shape check on `expiry_date`.
- Adds `fill_job()`.

Pre-check on each database; the result must be 0:

```sql
SELECT count(*) FROM recruitment.jobs WHERE expiry_date IS NOT NULL AND expiry_date !~ '^\d{4}-\d{2}-\d{2}';
```

**Tests**
- `tests/job-ranking.test.ts`: ranking order, qualification and date maths.
- `scripts/test-jobs-postgres.ts`: real PostgreSQL. Covers duration hiding, whole-database ranking, pipeline without stage reset, atomic fill plus placement plus stage history, second fill refused, edit keeps filled, reopen, erasure and delete cascade.
- The script is added to the `postgres-policies` CI job. `STAGE_2_UAT.md` has the live checks.

**Verified on this branch:** `tsc` 0, build OK, 88/88 unit, e2e 36 passed / 14 skipped (credentials), and all SQL policy files plus every `scripts/test-*-postgres.ts` (including media) on a fresh local replay.

**Not committed:** `npm run build` here reorders `routeTree.gen.ts` imports with no route changes, so that file was left as you committed it.

## Step 1 — land in devacnt

```bash
git fetch https://github.com/JSHrs/uktl-.git claude/cv-parsing-dashboard-design-MlDEc
git merge --ff-only FETCH_HEAD
npm ci && npm run test:unit && npx tsc --noEmit && npm run build && npm run test:e2e
git push origin main && git push https://github.com/JSHrs/uktl-.git main
```

## Step 2 — database

Apply both pending migrations, in order: staging first, then the UKTL project. Use `supabase db push --dry-run`, then push, then reconcile remote history.

## Step 3 — verify

- `git ls-remote` for both repos: identical trees (or identical SHAs).
- CI green on devacnt `main`.
- `supabase migration list` shows `20260924122319` and `20260924125857` with Local = Remote.
- Record the checkpoint in `RELEASE_CHECKLIST.md`.

## Step 4 — remove this note from both repositories

```bash
git rm ASTRA_PICKUP.md && git commit -m "Remove pick-up note after verifying merge and migrations"
git push origin main && git push https://github.com/JSHrs/uktl-.git main
```
