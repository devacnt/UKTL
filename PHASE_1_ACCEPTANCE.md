# Phase 1 acceptance — 13 October 2026

Status: engineering changes under verification; **not accepted for production**.
Hosting remains Lovable. Cloudflare work is excluded at the owner's request.

The original text of A1.1–A1.9 is not present in this repository. The mapping below is a working traceability matrix from the owner's seven requirements plus mobile/browser and evidence requirements; it is not a claim that an unseen acceptance specification passed.

| Working ID | Requirement | Implementation / remaining acceptance |
|---|---|---|
| A1.1 | Auth and separate roles | Main sign-in routes staff through MFA; magic-link button; candidate/employer account types with owner-only RLS and no staff promotion. Employer account type is selected in Profile after registration. Live email delivery, reset, MFA and candidate A/B tests outstanding. |
| A1.2 | Private CV ≤10 MB, versions | Private bucket confirmed, immutable originals registered in cv_versions, account upload history. No successful deployed upload observed. Scanner configuration and live clean/blocked-file checks outstanding. |
| A1.3 | Claude extraction, editable profile | Existing extraction/editor retained. Live provider/worker round trip outstanding. |
| A1.4 | Five scores and improvement report | Adds clarity and structure to contact, experience, skills and education. Older four-part results say Not assessed for the new category; never fabricate a fifth historical score. |
| A1.5 | Daily Reed, dedupe, 30-day expiry | Import and daily-cycle code retained; expiry capped at the earlier Reed date or 30 days from publication/first import, never extended by repeated import. Cron is not installed on target; live activation and completed cycle outstanding. |
| A1.6 | Ranked matches and reasons | Rules-based ranking of AI-extracted profiles, separate Claude evidence review; reasons now visible in swipe discovery. Not an AI-generated hiring decision. Live candidate journey outstanding. |
| A1.7 | Swipe, saved jobs, Apply on Reed | Save/dismiss/undo retained; saved-only filter and validated external Reed links. External click does not assert an application was submitted. Authenticated persistence checks outstanding. |
| A1.8 | Mobile 375 px and four browsers | 375 px test added, mobile account navigation, compact account footer, narrow upload layout. Chrome/Chromium, Firefox, Edge and WebKit projects configured. WebKit is Safari-engine coverage, not real-device Safari sign-off. |
| A1.9 | Evidence | Unit tests rerun; PostgreSQL/RLS CI expanded; manual script below. Browser installation failed locally; use CI artifacts. No passing Lighthouse or full authenticated staging claim. |

## Testing simulation

The upload page has an explicit browser-only simulation. It validates basic PDF/DOCX size/signature, displays an editable fictional example and five scores, and clears on refresh. It does not upload or scan the document, call Claude, write candidate data or send messages. It is not evidence that the real upload/parser works. Live uploads retain fail-closed scanning. Do not remove that protection to make a test appear successful.

## Manual deployed journey (record tester, date, browser and result)

1. Create two disposable confirmed candidate accounts and an employer account. Register, password-login, magic-link-login, logout, reset password, reject reused/expired reset links. Select employer in Profile and verify no candidate/staff data is exposed.
2. Sign in through `/auth/login` with a named staff account. Verify MFA enrollment/challenge; reject AAL1, inactive membership, wrong codes and candidate attempts to access admin.
3. Candidate A uploads clean synthetic PDF/DOCX at small size and 10 MB; reject >10 MB and spoofed files. Verify private object and version metadata, processing completion and no cross-account/anonymous download. Use the scanner's approved test procedure for blocked files.
4. Check all extracted fields, edit them, refresh and confirm five-part assessment and improvement report. Upload a second CV and verify both originals remain available to the owner only.
5. Run Reed sync twice with controlled fixtures, confirm one row per source ID, earliest expiry, no expiry extension, UK vacancy scope and a completed daily cycle.
6. Search → ranked matches/reason → swipe/save/dismiss → refresh → saved-only list → undo. Follow Apply on Reed and confirm correct job URL. Staff see internal interest and the linked profile, never a false external-application status.
7. Repeat primary journeys at 375 px on Chrome, Edge, Firefox and Safari, including keyboard, touch, reduced motion, errors and mobile menu. Check all authenticated screens for overflow and clipped text.
8. Retain unit and RLS logs, screenshots/traces (without credentials), manual results and Lighthouse reports tied to the deployed commit. Skips and simulation do not pass real-provider acceptance.

## Operational blockers observed

- Target Supabase `fvkffdeindboirukscfq`: private `uktl-cvs` bucket, 10,485,760-byte limit; no candidate records or processing jobs at inspection. Owner email account not present.
- No `cron.job` relation; scheduled Reed operation is not active there.
- Secure owner account creation, disposable authenticated test accounts, scanner service configuration and successful provider/worker execution still need verification.
- Claude's unmerged guided-dashboard, profile editing, legal-page layout and content-brief commits were incorporated. Keep ASTRA_UX_REVIEW.md until its requested live walkthrough is actually complete.
- Main repositories and Claude branch must be verified against the final release tree before marking synchronization complete.
