# Talent Compass — development guidelines

Read this before changing anything. It is written for whoever picks the codebase up next, human or agent.

## What this is

UK Talent Link's public website plus **Talent Compass**, a recruitment platform: CV upload → Claude extraction → quality grading → matching against open mandates, with a candidate portal (Supabase Auth), an HR & employment-law knowledge module, consultation bookings, and an admin dashboard.

**Stack:** TanStack Start (React 19, file-based routing, server functions) · Tailwind v4 · Cloudflare Workers · Supabase PostgreSQL/Auth/Storage (legacy D1/R2 adapter retained) · Anthropic API · Resend · Reed.co.uk API. Built through `@lovable.dev/vite-tanstack-config`.

## Commands

| Command | Notes |
|---|---|
| `npm ci` | Node 24+. |
| `npm run dev` | Vite dev server on `:5173`. No Cloudflare bindings, so data functions return empty states and CV parsing throws a clear error. Admin login fails closed without configured secrets. |
| `npx tsc --noEmit` | **Must report 0 errors.** It was at 87 for a long time and hid a total runtime failure (`.validator` → `.inputValidator`). Treat any new error as a blocker. |
| `npm run build` | Workers bundle via Nitro (`dist/server` + `dist/client`). Must pass. `wrangler.toml` already points at it — see DEPLOYMENT.md §3. |
| `npm run lint` | ESLint with `prettier/prettier` as an error. The repo has never been prettier-formatted, so this fails on ~250 formatting lines. Use `npx eslint --rule 'prettier/prettier: off' <files>` for real findings until the repo is formatted in one dedicated commit. |
| `npm run test:e2e` | Playwright, specs in `e2e/`. Starts the dev server itself (or set `E2E_BASE_URL` to test a deployment). In the hosted sandbox add `PW_EXECUTABLE_PATH=/opt/pw-browsers/chromium`. Tests that write to D1 are skipped unless `E2E_HAS_DB=1`. Specs import `test` from `./fixtures`, whose `goto` waits for `<html data-hydrated>` — never interact before that. |
| CI | `.github/workflows/ci.yml` runs `tsc`, `build` and the e2e suite on every PR and push to `main`. |

## Where things live

```
src/routes/            file-based routes (routeTree.gen.ts is GENERATED — regenerate via dev/build and commit it)
  index.tsx, approach, services, sectors, contact   public site
  app/                 Talent Compass (overview, upload, candidates, jobs, discover, hr, profile)
  auth/                candidate login / register / forgot / callback
  admin/               admin dashboard (guarded by beforeLoad in admin.tsx)
  api/                 server routes (createFileRoute + server.handlers), e.g. api/cv/$id streams a CV from R2
src/lib/functions.ts   ALL server functions (createServerFn). Deliberately NOT under server/ — see rule 1.
src/lib/server/        server-only code: env (bindings), db (D1), staff-access (named Supabase membership + MFA),
                       viewer (isAdminRequest / requireAdmin / getViewer / canAccessCandidate),
                       parse (Claude extraction + grading), match, skills, anonymize, docx
src/lib/stages.ts      pipeline stage labels/tones (client-safe)
src/lib/supabase.ts    candidate session cookies + Supabase clients (server-side only)
src/lib/schemas/       zod schemas (profile, job)
src/components/site/   Nav, Footer, Layout, Reveal (public site)
src/components/app/    AppLayout primitives (app shell, stat cards, pills, empty states)
src/styles.css         design tokens (OKLCH paper/ink/accent), fonts, animations
migrations/            D1 migrations 0001–0009, applied in order by wrangler
supabase/migrations/   Canonical PostgreSQL 17 schema and RLS for the unified Supabase backend
e2e/                   Playwright specs
wrangler.toml          the ONLY Wrangler config (never add wrangler.json/jsonc — Wrangler prefers it silently);
                       bindings, vars per environment (vars are NOT inherited by named envs)
.github/workflows/     CI
```

## Hard rules

1. **Server functions live in `src/lib/functions.ts`, never under `src/lib/server/`.** The Lovable wrapper enables TanStack import-protection with `client.files: ["**/server/**"]`; a route importing anything under `server/` fails the client build. Server-only modules stay under `server/` and are only imported from `functions.ts` (top-level imports are dead-code-eliminated from the client bundle).
2. **Use `.inputValidator()`**, not `.validator()`. The old name is a runtime `TypeError` that breaks every page.
3. **Every privileged handler authenticates itself.** Route guards only protect navigation. Admin handlers call `await requireAdmin()` first. Candidate-data handlers use `getViewer()` + `canAccessCandidate()` (both in `src/lib/server/viewer.ts`, usable from server functions and server routes alike): admin sees everything, a signed-in candidate sees only rows whose `auth_user_id` is theirs, anonymous callers get `[]`/`null`/404. Keep it that way for anything new that reads or writes candidate data.
4. **`getEnv()` throws outside the Workers runtime.** Protected reads must throw a safe unavailable error; do not present an outage as an empty database. Public catalogue loaders may return an empty state in development. Never return fabricated records — the old `mockData.ts` fallback was removed for that reason.
5. **Migrations are append-only.** Supabase changes belong in `supabase/migrations`; use CLI migration creation, reconcile the applied remote timestamp and run the PostgreSQL CI replay/policy tests. Never edit applied SQL. Legacy D1 changes use `migrations/000N_name.sql`. A migration must be correct against the schema the previous files actually produce (0005 once redefined a table 0003 had already created and aborted). Prove new migrations by replaying 0001→N on SQLite (`node:sqlite` works in Node 22).
6. **`routeTree.gen.ts` is generated.** After adding or renaming a route, run dev or build and commit the regenerated file; a stale one silently drops routes from the type map.
7. **No secrets in the repo.** `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `JWT_SECRET`, `ADMIN_PASSWORD_HASH`, `SUPABASE_SERVICE_ROLE_KEY`, `REED_API_KEY` are `wrangler secret put`. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SITE_URL` are `[vars]` and must be repeated under `[env.staging.vars]` / `[env.production.vars]`.
8. **Design system, not ad-hoc styling.** Colours come from the tokens in `styles.css` (`paper`, `paper-deep`, `ink`, `ink-soft`, `ink-mute`, `rule`, `accent`, `accent-soft`, `accent-light`). Display type is Fraunces via `font-display` with `fontVariationSettings`, body is Geist, labels are Geist Mono uppercase tracked. Public-site sections use `<Reveal>` for entrance; the app shell uses the primitives in `AppLayout.tsx`. Respect `prefers-reduced-motion` (there is a global rule; new keyframes need a static end-state there).
9. **Keep `tsc` at zero and `npm run build` green before pushing.** Run both. Do not push speculative fixes.

## Who uses the site

UKTL is one recruitment firm. There are exactly two kinds of user, and no client/employer logins:

- **Candidates** — sign up (Supabase), upload their CV, see their own score, matches and HR guidance. Everything under `/app` requires sign-in (guard in `src/routes/app.tsx`); a candidate only ever sees their own records.
- **Firm staff** — the admin dashboard (`/admin`) plus the staff views of a candidate record and a mandate pipeline (`/app/candidates`, `/app/candidates/:id`, `/app/jobs/:id`). Staff-only actions are hidden from candidates and enforced server-side.

The root route loads the session once per navigation (`getSessionFn` → `context.session`); the shared header (`src/components/site/Nav.tsx`) and all route guards read it from there. After signing in or out, call `router.invalidate()` so the header updates.

## Auth model

- Staff use named Supabase Auth accounts. `recruitment.staff_users` is authoritative; user metadata never grants staff rights. Every privileged server action checks current membership, a verified email, a live Auth session and MFA through `get_my_staff_access`.
- Admins manage content and operations. Consultants read recruitment records and update match stages; candidate deletion and content management remain admin-only.
- `/admin/login` authenticates email/password; `/auth/security` enrolls/verifies TOTP. No shared-password cookie fallback exists. Legacy `auth.ts` and its regression tests are historical and are not used by current staff authorization.
- Candidates use server-verified Supabase sessions in httpOnly cookies. Profile edits use their own RLS client. Callback tokens are verified by Auth; recovery links lead to `/auth/reset`, update the password and revoke sessions.
- Configure the exact HTTPS `SITE_URL` + `/auth/callback` in Supabase Auth. Resend SMTP handles Auth email. Provider credentials stay in server secrets.
- Stage 1 and subsequent release requirements are in `DEVELOPMENT_GATES.md`; skipped authenticated tests never pass a stage.

## Consultations, FAQ media, outreach, exports (Supabase)

- **Calendar** (`server/calendar.ts`, `booking-functions.ts`): weekly `availability_rules` in Europe/London wall time, `availability_blocks` closures, singleton `booking_settings`. Slot maths is pure (`generateSlots`, DST-tested). `recruitment.reserve_consultation()` re-checks buffers/closures/daily and per-candidate limits under an advisory lock; an exclusion constraint forbids overlapping confirmed native bookings. Emails go through the `booking_events` outbox (candidate + team, `.ics` attached). `/api/consultations/:id` serves the calendar file to its owner or staff.
- **FAQ media** (`server/media.ts`, `faq-functions.ts`): browser uploads straight to the private `uktl-videos` bucket with a signed upload URL; `attachMedia` verifies size, MIME and magic bytes before referencing it. Formats: MP4/WebM ≤100 MB, WebVTT ≤1 MB, JPEG/PNG/WebP ≤5 MB. Approval (`reviewed_at`) is withdrawn by a trigger on any content/media change.
- **Outreach** (`server/admin-tools.ts`, `outreach-templates.ts`): staff-only, logged in `candidate_messages`, idempotent Resend key per message, verified account email preferred.
- **CSV** (`/api/admin/export/:kind`): admin + MFA, formula-injection safe, audited in the same transaction.
- **Mandates** (`server/job-tools.ts`, `job-functions.ts`, `/admin/jobs/:id`): posting/closing dates use `posted_date`/`expiry_date` (expired mandates leave discovery); `rankCandidatesForJob` scores every parsed CV (newest 5,000) with the rules-based `scoreMatch` and labels "qualified" (score ≥ 60 and every must-have). `addToPipeline` never resets a stage. `recruitment.fill_job()` marks a mandate `filled` and the placed candidate's match `placed` in one transaction; `reopenJob` clears it. Editing a filled mandate keeps it filled.

## Data model (D1)

`candidates` (+ `candidate_skills`, `candidate_experience`, `candidate_education`, `candidate_swipes`) · `jobs` (with `source`/`source_id` for Reed dedup) · `matches` (score fields owned by the matcher; `stage` owned by consultants and never reset by re-scoring) · `faq_topics` · `hr_queries` · `bookings` · `enquiries`.
`candidates.auth_user_id` is the authoritative link to a Supabase user; `profiles.d1_candidate_id` in Supabase is a best-effort mirror. CV bytes live in R2 at `cvs/<candidate_id>/<filename>`; the full Claude extraction is kept in `candidates.raw_profile` for re-matching.

## Verification checklist (before every push)

- `npx tsc --noEmit` → 0
- `npm run build` → exit 0
- `npm run dev`, then confirm `/`, `/app`, `/auth/login`, `/admin/login` return 200 and `/app/candidates` redirects when signed out
- New server function? It has an `inputValidator`, an auth check if it touches anything private, and a try/catch around `getEnv()` if it is called from a public loader
- New route? `routeTree.gen.ts` regenerated and committed
- New migration? Replayed from 0001 on a scratch DB

## Known gaps (not bugs — unbuilt)

Scheduled Reed sync (manual button only) · bulk/scheduled candidate email campaigns (one-to-one outreach exists) · candidate-visible message history · appointment reminder emails · staff calendar sync (Google/Outlook) · AI-assisted (non-rules) candidate ranking · D1 legacy support for calendar, media upload, outreach, exports and mandate fill (Supabase-only).


## Launch hardening verification

- `npm run test:unit` runs Node 24 regression tests (including actual SQLite migration replay).
- CI runs regression tests, typecheck, Workers build and Playwright.
- Set `E2E_BASE_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_ADMIN_TOTP_SECRET`, and `E2E_HAS_DB=1` only against disposable staging data. Authenticated browser tests skip without configured credentials; no test bypass is present in production code.
- Rate limits are persisted in D1 migration 0009 and fail closed. Anonymous IP limits rely only on Cloudflare's overwritten `cf-connecting-ip`; missing headers share a conservative bucket.
- Notifications persist sent/failed/skipped/sending state and use stable provider idempotency keys. Admin retry is limited to records under 23h old; old or interrupted sends require provider-log reconciliation before any manual resend.
- Never log provider response bodies containing candidate information or credentials.

## 23 September operations hardening

Read OPERATIONS_RUNBOOK.md and RELEASE_CHECKLIST.md. The owner authorized Stage 4 engineering before earlier live acceptance, with Cloudflare last. Live acceptance still cannot pass on skipped tests. Use the request-scoped audited database in server functions; never accept an actor ID from client input. Supabase candidate deletion must use the durable file-deletion queue, never the legacy row-only helper. Private Supabase CV storage requires the configured scanner gateway for upload and download. AI calls use trackedAnthropicFetch with runtime telemetry so the shared hourly budget applies. Keep provider secrets and bodies out of audit/usage logs. Privacy/usage pages are factual product information and still require a complete owner/legal-approved notice before launch.
