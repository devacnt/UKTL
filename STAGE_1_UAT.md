# Stage 1 — accounts, staff roles and staging acceptance

## Hosting decision — 18 September 2026

The owner will connect Cloudflare through Lovable later. Continue GitHub development without waiting for hosting, runtime secrets or Stage 1 live UAT. Implementation phases may advance after their automated checks pass; deployed acceptance remains OPEN until tested. Revisit the connection when the application is ready for integrated staging tests, and again before production release. No Lovable credits are authorized or needed for the current coding work.


Status: implementation under verification; live user acceptance BLOCKED until the prerequisites below are supplied. Do not mark this stage complete from unit or anonymous browser tests alone.

## Configuration required from the account owner

1. Confirm the email address of the named first administrator and the Cloudflare account/Workers subdomain. Do not send passwords, MFA secrets or API keys in chat.
2. Provision a separate Supabase staging project or isolated branch. Production project `fvkffdeindboirukscfq` must never be used for destructive test data. Apply the canonical migrations to the empty staging database, checking migration history first.
3. In GitHub repository Settings → Environments, create `staging`. Add variables `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SITE_URL` (`https://uktl-staging.<workers-subdomain>.workers.dev`). Add secrets `CLOUDFLARE_API_TOKEN` (Workers deployment access), `DATABASE_URL` (matching staging pooler), and `SUPABASE_SERVICE_ROLE_KEY`. Provider keys are needed before Stage 2/3 live tests.
4. Configure Auth site URL and the exact `/auth/callback` redirect for staging; require email confirmation; enable TOTP enrollment and verification. Set Resend SMTP using the verified sender/domain, test credentials and Supabase email templates. Use a separate sender/test mode where available.
5. Create and confirm named staging Auth accounts for admin, consultant, inactive staff and candidates A/B. Record each Auth UUID. The project owner inserts the approved staff membership using the SQL Editor, matching the verified Auth UUID. Example uses placeholders, never a shared application password:

```sql
INSERT INTO recruitment.staff_users(user_id,role,active,created_at)
SELECT id,'admin',true,(extract(epoch FROM now())*1000)::bigint
FROM auth.users WHERE id = '<verified-auth-user-uuid>'::uuid
AND email_confirmed_at IS NOT NULL;
```

Use `consultant` for the consultant and set `active=false` for the inactive account. No browser/API client may promote itself. Do not enroll real staff in automation.
6. Enroll a disposable, named staging automation admin in TOTP through a controlled initial deployment or the Supabase Auth API. Store only its staging credentials as GitHub environment secrets `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_ADMIN_TOTP_SECRET`. These are required by the manual staging test workflow; never use a real administrator's authenticator secret.
7. Run the manual **Staging deployment and authenticated checks** workflow on main. It validates isolation, builds, deploys with secrets, and refuses skipped, failed or flaky browser cases. It does not create identities, configure SMTP, alter production Auth or declare UAT passed.

For initial setup before the automation account is enrolled, an operator can run `node scripts/prepare-staging.mjs`, build, and `npx wrangler deploy --config .deploy/staging.json --secrets-file .deploy/secrets.json` from a secure workstation with the listed environment values. Remove `.deploy` afterward. This is bootstrap only, not acceptance.

## User test — record actual results

| Check | Expected result | Result / tester / date |
|---|---|---|
| Candidate registration | Confirmation email received; link works on confirmed origin | BLOCKED |
| Login / refresh / logout | Own profile persists; logout revokes refresh session | BLOCKED |
| Continue with Google | New Google user lands on the requested page with a profile name; same-email existing account is linked, not duplicated; cancelling at Google returns to a clear error | BLOCKED |
| Continue with Apple | First sign-in stores the name; "Hide My Email" works as its own account; renewal date for the Apple secret recorded | BLOCKED |
| Password reset | Email link opens new-password form; new password works; old one fails | BLOCKED |
| Reused/expired reset link | Safe error; no password update | BLOCKED |
| Profile edit | Name/contact/location/sector persist after reload | BLOCKED |
| Candidate A/B isolation | Each sees only own profile/CV; direct other-ID requests denied | BLOCKED |
| Staff first factor | Password alone cannot open privileged screens | BLOCKED |
| MFA setup and login | Scan code, verify, log out/in, enter new code; invalid code rejected | BLOCKED |
| Consultant scope | Candidate review/stage updates work; admin deletion/content actions denied | BLOCKED |
| Inactive/revoked staff | Existing session immediately loses staff privilege after revocation | BLOCKED |
| Private CV download | Owner/verified staff succeed; other candidate and anonymous fail | BLOCKED |
| Mobile / keyboard | Labels, focus, errors and authenticator form usable | BLOCKED |

## System evidence

- Local unit tests, TypeScript, build, targeted lint and whitespace checks.
- GitHub CI: anonymous browser checks plus PostgreSQL 17 fresh migration replay and rollback authorization tests.
- Target project: rollback policy test passed, security advisor no findings, fifth migration recorded under its actual remote version.
- Staging: require the actual deployment URL and passing authenticated workflow run. No skipped cases accepted.
- UAT: fill every row above and retain the reviewer/date. Missing required evidence blocks Stage 1.

## Staff MFA recovery

Verify identity through the account owner's established process. Deactivate the staff membership first, revoke its Auth sessions, and have an authorized Supabase project owner remove the lost factor. Re-enable only the verified person's account for fresh enrollment. Their first-factor session still receives no staff privileges. Record operator, reason and timestamp in the incident log. Never add an application bypass or distribute a shared emergency password. Exercise this on the disposable staging account before launch.

## Next stage after acceptance

Recruitment: durable processing and orphan cleanup; editable extracted profiles; reviewed CV scoring; daily Reed Edge Function; evidence-based Claude matching; ranked discovery and reliable interest history. See Gate 2 in DEVELOPMENT_GATES.md.
