# Communications delivery evidence — 24 September 2026

## Implemented and merged

Source PR: https://github.com/devacnt/UKTL/pull/4 — merge `f51639fe4fe8027f459cd4cf13e0f26987039bf0`.
Mirror PR: https://github.com/JSHrs/uktl-/pull/16 — merge `f2a3c68ae700f1e094960e7ae3d871eb1fd6ac3f`.
Both contain tree `7e1f4d5003cf3592beffc71e2ffd0d7921885aea`.

- Candidate-owned sent-message inbox and read status, including messages across their CV versions.
- Explicit campaign opt-in; admin drafts, audience preview/fingerprint, schedule confirmation, unsubscribe and cancellation.
- Durable 24-hour/1-hour native appointment reminder queue with stale/cancelled booking checks and bounded retries.
- Google/Outlook OAuth, encrypted refresh credentials, generic appointment export, external busy-time import, cancellation/erasure cleanup and stale-calendar booking gate.
- Lovable server-environment support and a disabled-by-default scheduler limited to the source repository.

## Verification

Source CI https://github.com/devacnt/UKTL/actions/runs/36012633279 and mirror CI https://github.com/JSHrs/uktl-/actions/runs/36012742257 passed.

94 unit tests passed; TypeScript and production build passed; 42 browser tests passed. **14 credential-dependent browser tests skipped, not accepted.** PostgreSQL CI replayed every migration and passed existing authorization/storage/CV/HR/mandate suites plus new inbox ownership, opt-out, frozen audience, reminder dedupe/cancellation/retry, Google OAuth state, encryption, synchronization and erasure tests. Follow-up coverage adds the Outlook provider journey with synthetic responses; this is not live OAuth evidence.

The three migrations were applied to UKTL project `fvkffdeindboirukscfq` after isolated PostgreSQL checks:

| Migration | Applied version |
| --- | --- |
| native_calendar_media_outreach | 20260924142748 |
| job_lifecycle_and_fulfilment | 20260924142808 |
| communications_calendar_sync | 20260924142817 |

Source filenames were reconciled with these applied versions; SQL contents were not changed. All six new backend tables have RLS enabled and no authenticated-role SELECT privilege. Supabase security advisor returned no findings after application. Preflight found zero malformed non-empty mandate expiry dates. No real campaigns or live reminder emails were sent.

Lovable accepted publication request `db7e6012-8277-4eb9-8de5-b18f6921652c`; project metadata reported the mirror merge as latest source. Browser inspection confirmed the new `/unsubscribe` page at https://uktl.lovable.app/unsubscribe. Live browser navigation to `/app/messages` redirected to candidate sign-in; `/admin/campaigns` redirected to staff sign-in. This establishes published frontend code and anonymous navigation guards, not authenticated ownership or a configured backend.

## Blocked live acceptance

The Lovable project Secrets table showed only `LOVABLE_API_KEY` (names inspected, no values exposed). Required backend/database, email, OAuth, scheduler and scanner configuration was absent from that table. UKTL SQL inspection found **zero active staff memberships**. No separate hosted staging database was available through the connected Supabase account.

Consequently authenticated candidate/staff journeys, real Google/Outlook consent and event delivery, actual campaign/reminder mailbox delivery and a live scanner clean/EICAR/failure journey are **BLOCKED**, not passed. The scanner gateway code and synthetic tests exist; there is no verified deployed ClamAV endpoint in this evidence. Office availability also needs owner-approved configuration before native booking acceptance.

The next activation step is secure server configuration plus isolated staging identities (candidate A/B and named MFA staff). Follow `COMMUNICATIONS_RUNBOOK.md`; never paste secrets into chat. No Cloudflare changes were made. Claude's pickup note was removed only after both implementation merges and both pending database migrations were confirmed.

Implementation is now in integration and acceptance, approximately 85–90% of agreed engineering scope by judgement, not a measured completion ratio. Production acceptance remains open; deployment configuration, authenticated journeys, scanner/provider evidence and the existing release checklist are still required.
