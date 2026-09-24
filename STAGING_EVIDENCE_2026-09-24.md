# Lovable staging review — 24 September 2026

## Evidence and scope

Lovable reports the project published to a public audience at merged commit `dcfae078c7fbfa07a4a457434d3757d1e24d67ae`. Its provided preview address was opened successfully in a browser:
`https://id-preview--b976b2a4-fea6-43dc-a8da-72d7238985c7.lovable.app/`.
This is the verified preview address, not a separately verified production custom domain.

The public landing renders the candidate-first content. Following the visible footer's Open roles link resolves to `/auth/login?redirect=%2Fapp%2Fjobs`, protecting the candidate portal. This is signed-out acceptance only: no candidate decision, staff profile access, booking, upload, or real email delivery has been accepted in the deployed environment.

Cloudflare configuration/deployment is excluded from this review at the owner's request; Lovable is the hosting target.

## Changes in this review

- Landing headings no longer clip glyphs within word/line animation masks. Smaller minimum hero type and natural wrapping fit narrow screens.
- Scroll reveal content defaults to visible; missing JavaScript, reduced motion, or an untriggered observer cannot leave entire sections blank. Observer threshold no longer depends on a large fraction of a tall section being in view.
- Small text in contrasting landing bands uses 80% foreground opacity instead of 25–55%.
- Role/company/skill and location filters are shared between All jobs and swipe discovery, carried in URL search parameters. Search result counts and empty states are explicit. Swipe view excludes already-decided roles by its existing server loader.
- Preserves Claude's `1848605` mandate duration/ranking/fill work.

## Job journey verified in source

`/app/jobs` lists UKTL mandates and imported vacancies. Reed import exists; no Sorce integration was found. Search is over the loaded UKTL catalogue, not a live query across external job boards.

`/app/discover` supports pointer swipes, buttons, keyboard arrows and undo. A right swipe saves `interested`; a left swipe saves `dismissed` in `candidate_swipes`, keyed by candidate and job with a timestamp. Ownership is checked server-side. A failed save keeps the card. `/app/activity` shows the user's history.

Staff see Expressed interest on the job detail page, with links to the candidate profiles. This is internal interest, not an external job application, and it does not automatically email the admin. Existing match pipeline stages are a separate staff workflow. No claim of automatic application submission should appear in the product.

## Outstanding acceptance and functionality

- Appointment reminders are unbuilt; booking-event confirmation/rescheduling emails are separate.
- Google/Outlook calendar synchronization is unbuilt; ICS download is not synchronization.
- Bulk/scheduled email campaigns are unbuilt; logged one-to-one outreach exists.
- Candidate-visible inbox/message history is unbuilt.
- Two pending database migrations from the Claude handoff still require isolated staging replay, target application and history reconciliation. Keep `ASTRA_PICKUP.md` until its database and merge conditions are fulfilled.
- Authenticated candidate and MFA staff acceptance requires test accounts and disposable staging data. Public accessibility alone does not prove these journeys.
- CV malware scanning still requires a configured scanner service and live acceptance; fail-closed code is not deployment evidence.

## Regression evidence

Local TypeScript and production bundle passed. Unit tests: 89 passed, none skipped. New Playwright layout checks cover 320, 390, 768 and 1440px, including reduced-motion visibility and heading overflow. Local browser execution initially blocked because Chromium was not installed; CI results must establish browser and PostgreSQL acceptance before merging.
