# Production evidence ledger

Every required row needs a dated result, commit and evidence link. `not run`, `skipped` and absent credentials are BLOCKED, never PASS. This ledger does not authorize fabricated review or approval.

| Requirement | Evidence needed | Current disposition |
|---|---|---|
| Source uniformity | Both main branches and active Claude branch at identical SHA | Verify after each merge |
| Dependencies | Fresh production and full dependency audit | Local remediation reports zero; verify locked CI install |
| Code | Unit, typecheck, Workers build, browser and real PostgreSQL tests | Execute for each candidate release |
| Accounts | Candidate A/B, named admin/consultant, MFA and password reset | Live acceptance open; active staff count was zero on 23 September |
| Private files | Real clean/infected scanner cases; cross-account access denied | Adapter and regression tests implemented; private gateway required |
| Recruitment | Upload/edit/retry, human-reviewed scores, sync/expiry/recovery | Live and reviewed acceptance open |
| HR/consultations | Approved sources/video, real verified booking/cancel and email | No approved sources/published topics/verified bookings in current database on 23 September |
| Privacy | Complete export/erasure run, retention/holds and reviewed notices | Self-service copy, reviewed account erasure and retryable file cleanup implemented; real provider/full-scope fulfillment acceptance remains open |
| Operations | Alert delivered; measured restore, rollback, MFA recovery | Runbook/checker prepared; live exercises open |
| Accessibility/load | Mobile/keyboard/contrast and measured throughput/timeouts | Execute on isolated staging; never production candidate data |
| Database reconciliation | Confirm former Lovable database, compare schema safely | Deferred until implementation ends; identity/access required |
| Hosting | Cloudflare staging then approved production, secrets, redirects, domain | Last, per owner instruction |

Do not deploy real candidate processing until scanner/data handling, private access, reviewed notices and required acceptance evidence are satisfied.

## Verified engineering checkpoint — 23 September 2026

## Claude handoff — 24 September 2026

The native consultation calendar replaces Calendly; FAQ written answers/media uploads, analytics charts, audited CSV exports and staff outreach are implemented. Handoff review adds transactional outreach deduplication, bounded media signature reads and explicit CSV export limits. Source: Claude commits `338123e` and `48f80df` on `JSHrs/uktl-`.

The native-calendar migration was replayed in isolated CI and applied to UKTL as `20260924142748_native_calendar_media_outreach`; mandate lifecycle as `20260924142808_job_lifecycle_and_fulfilment`; communications as `20260924142817_communications_calendar_sync`. Filenames match remote history. No separate hosted staging project has been verified. Configure real office availability (none is seeded), verify the 100 MB upload limit, and use test inboxes only for acceptance. Google/Outlook sync, reminders, consent-based campaigns and candidate-visible messages are implemented; live activation and authenticated acceptance remain open. Generated meeting links remain out of scope. See `COMMUNICATIONS_RUNBOOK.md` and `COMMUNICATIONS_EVIDENCE_2026-09-24.md`.

### Previous verified checkpoint

- Source commit `f0451e3d449b2237f24403be9e461ef252b19466`: [CI run](https://github.com/devacnt/UKTL/actions/runs/35899128210) passed both jobs: 75 unit tests, TypeScript, Workers build, 35 browser cases, and all real PostgreSQL integration/policy tests. The 14 credential-dependent browser cases were skipped and remain open launch gates. Locked dependency installation reports zero vulnerabilities.
- Connected UKTL Supabase project: operations/privacy/audit and reviewed account-erasure migrations applied as `20260923175936` and `20260923175954`; explicit service-only policies applied as `20260923180105`. No live account erasure or candidate deletion was performed. Migration filenames match remote history.
- Registry throttling interrupted earlier CI before SQL execution. Database CI now starts only PostgreSQL using the official Docker Hub images, with every regression still enabled.
