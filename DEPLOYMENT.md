# UKTL deployment and release

Current runtime target: Cloudflare Workers with Supabase PostgreSQL, Auth and private Storage. Development is performed through GitHub; Lovable credits are not required. No application deployment has yet been verified.

## Staging

Follow STAGE_1_UAT.md. The manual `.github/workflows/staging.yml` workflow validates a distinct Supabase project, generates explicit Worker configuration, builds, deploys with a private secrets file and runs authenticated browser checks. It fails on missing credentials or skipped/flaky/failed test cases. Staging migrations, Auth SMTP/redirects and verified test identities must be configured first.

The generated `.deploy` directory is ignored by git, uses restrictive permissions and is deleted by the workflow. It contains server secrets temporarily; never publish it or include it in artifacts. The workflow uses an explicit `--config`; do not create a competing root Wrangler JSON configuration.

Before running the workflow, require the same commit's CI jobs to pass: unit tests, TypeScript, Workers build, anonymous browser tests, clean PostgreSQL 17 migration replay and policy regressions. A successful workflow does not replace the user's email, MFA and UAT checks.

## Production prerequisites

Production project: `fvkffdeindboirukscfq`. Canonical migration history is documented in SUPABASE_INSTALLATION.md. Do not replay legacy baseline files. Confirm migration history and inspect the CLI dry run before any push.

Production remains gated by DEVELOPMENT_GATES.md, including isolated staging UAT, actual CV/recruitment and HR/booking journeys, backup restoration, monitoring, privacy workflows and a tested rollback plan. Confirm the production origin and set Auth redirects exactly; no production host is presumed.

Required runtime configuration: `DATA_BACKEND=supabase`, project URL and public key, confirmed `SITE_URL`, `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Live functionality also needs Anthropic, Resend and Reed configuration. Consultations use the native calendar (no scheduling provider); staff set opening hours in Admin → Consultations before candidates can book. Scheduling must use a strong dedicated secret and remains disabled until tested. Provider subscriptions, video content and domain verification are client deliverables.

Staff access uses named verified Supabase users, current `recruitment.staff_users` membership and MFA. `ADMIN_PASSWORD_HASH` and `JWT_SECRET` do not enable current staff access. Public profile writes are scoped to the authenticated user; the private recruitment adapter still uses a privileged server connection, so every server action must authorize itself.

## Hosting on Lovable: required server settings

Lovable builds project UKTL (`b976b2a4-fea6-43dc-a8da-72d7238985c7`) from `main`, so merged changes are picked up automatically. Its server runtime reads **server-side environment variables/secrets set in the Lovable project**; nothing is read from files in the repository. If they are missing, sign-in shows "Sign-in is temporarily unavailable", and the exact missing setting is written to the server log.

| Variable | Needed for | Notes |
|---|---|---|
| `SUPABASE_URL` | all sign-in, including Google/Apple | `https://<project-ref>.supabase.co`. `VITE_SUPABASE_URL` is accepted as a fallback. |
| `SUPABASE_ANON_KEY` | all sign-in | Public key. Lovable's `SUPABASE_PUBLISHABLE_KEY`, or `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY`, is accepted instead. |
| `DATABASE_URL` | only when `DB_TRANSPORT=postgres` | Not needed on Lovable. By default the app reaches the database over HTTPS through `public.uktl_run_batch` (service-role key), because Cloudflare Workers cannot verify the pooler's Supabase-issued TLS certificate (connections time out). |
| `SUPABASE_SERVICE_ROLE_KEY` | CV storage, staff tools | Secret. Never use a `VITE_` name. |
| `SITE_URL` | email links, Google/Apple return address | Optional. Defaults to the address the request arrived on. Set `https://uktl.lovable.app` (or the custom domain) for production. |
| `DATA_BACKEND` | — | Optional outside Cloudflare; defaults to `supabase`. |
| `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `CV_SCAN_URL`, `CV_SCAN_TOKEN`, `REED_API_KEY` | email, CV parsing, scheduled jobs, scanning, Reed | Secrets. See COMMUNICATIONS_RUNBOOK.md and OPERATIONS_RUNBOOK.md. |

**Lovable Cloud clash:** Lovable Cloud (enabled on this project on 27 September; empty project `jwfycrmrgwslxyxvirfn`) manages its own `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. UKTL's values therefore go in as **`UKTL_SUPABASE_URL`, `UKTL_SUPABASE_ANON_KEY`, `UKTL_DATABASE_URL` and `UKTL_SUPABASE_SERVICE_ROLE_KEY`** (and optionally `UKTL_SITE_URL`). A `UKTL_` value always takes precedence over the unprefixed name.

**Same project rule:** `SUPABASE_URL` and `DATABASE_URL` must belong to the same Supabase project. If they don't, sign-in refuses to run and the log says `…point at different Supabase projects`. Lovable's "Connect Supabase" integration only supplies the URL and public key. It does not create UKTL's tables, and it does not supply `DATABASE_URL`.

### Connecting Lovable to the UKTL database, step by step

1. **Connect the right project.** In Lovable, disconnect any Supabase project that is not UKTL's, then connect the UKTL project. The UKTL reference is recorded in SUPABASE_INSTALLATION.md. Lovable regenerates `.env` with its URL and public key.
2. **Copy the database connection string.** In the Supabase dashboard for that project, click **Connect** → **Connection string** → **Transaction pooler** (port 6543). Copy the URI and replace `[YOUR-PASSWORD]` with the database password. If the password is unknown, reset it under Project Settings → Database.
3. **Copy the service-role key.** In the Supabase dashboard, go to Project Settings → API Keys and copy the **service_role** / **secret** key. Never paste it into chat, code or any `VITE_` variable.
4. **Add the secrets in Lovable.** Add these as project secrets / server environment variables: `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and, for production, `SITE_URL`. The label differs between Lovable versions; asking Lovable's chat to "add secrets DATABASE_URL and SUPABASE_SERVICE_ROLE_KEY" opens its secure entry form.
5. **Create UKTL's tables.** Apply the repository's `supabase/migrations` to that project with `supabase link --project-ref <ref>`, then `supabase db push --dry-run` and `supabase db push`. Connecting alone does not create tables.
6. **Allow the redirect addresses.** Add the redirect URLs below in Supabase Auth, then register a test account on the preview.

In Supabase → Authentication → URL Configuration, the redirect allow-list must contain every address candidates use:
- `https://uktl.lovable.app/auth/callback`
- `https://id-preview--b976b2a4-fea6-43dc-a8da-72d7238985c7.lovable.app/auth/callback`
- any custom domain + `/auth/callback`

Set the Site URL to the production address.

## Google and Apple sign-in (candidates)

The login and sign-up pages always show "Continue with Apple" and "Continue with Google". Until a provider is enabled in the Supabase project, its button tells the candidate to use email for now. Staff still sign in with email, password and MFA at `/admin/login`.

1. **Google.** In Google Cloud Console → APIs & Services → Credentials, create an OAuth client ID of type *Web application*.
   - Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
   - OAuth consent screen: publish it with the app name, privacy policy and support email.
2. **Apple.** This needs an Apple Developer Program membership. Under Certificates, IDs & Profiles:
   - Create a **Services ID** (this is the client ID) with Sign in with Apple enabled.
   - Set its domain to `<project-ref>.supabase.co` and its return URL to `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Create a **Key** with Sign in with Apple enabled, then generate the client secret JWT from the Team ID, Key ID and `.p8` key.
   - The Apple secret **expires after at most 6 months**. Record its renewal in OPERATIONS_RUNBOOK.md.
3. **Supabase.** In Dashboard → Authentication → Sign In / Providers, enable Google and Apple and paste each client ID and secret.
   - Under URL Configuration, the redirect allow-list must contain the exact `SITE_URL` + `/auth/callback`. This is already required for email links.
   - Keep "Minimum password length" at 8 or lower.
4. **Accounts.** A person who signs in with Google or Apple using the same verified email as an existing email/password account is linked to that account by Supabase. Apple "Hide My Email" addresses are separate accounts. Candidates choosing that option are told on screen that the provider's email is used.

The flow is server-side PKCE (`src/lib/server/oauth.ts`):
- The code verifier and the post-sign-in destination live in a 10-minute httpOnly cookie.
- The callback exchanges the one-time code for the same httpOnly session cookies email sign-in uses.
- Tokens never appear in the URL or browser storage.
- Off-site redirects are reduced to `/app`.

## Release and rollback checks

- Record the exact commit, migration list, provider configuration versions and deploy identifier.
- Confirm no secrets or personal data in client bundles, logs or public Storage.
- Exercise registration/recovery, private downloads, upload-to-match, interests, HR escalation, bookings and role separation in staging.
- Confirm backup restoration in a disposable environment, monitoring alerts and operator recovery procedures.
- After signed UAT, deploy production; verify public and authenticated smoke tests and provider delivery.
- For an application regression, use Cloudflare's previous verified Worker version. Assess database compatibility before rollback. Do not reverse migrations blindly or remove production data.

Legacy D1/R2 infrastructure instructions are archived in docs/LEGACY_D1_DEPLOYMENT.md. They are not the current production setup.


## Durable CV worker

Supabase uploads now return a queued state and require the protected worker to process them. See STAGE_2_UAT.md for exact manual and scheduled setup, runtime secrets and acceptance checks. The scheduled workflow is disabled until `ENABLE_CV_WORKER=true`; hosting remains deferred by the owner. Do not enable scheduling against production before isolated staging acceptance.
