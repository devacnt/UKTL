# Astra — secondary UX and flow review (28 September 2026)

The owner has asked for a second pass over the candidate experience, the footer pages and every other page, so the whole site feels complete and every page works. Delete this file in the commit that records the review results.

## What Claude changed in this branch

These changes come from a signed-in walkthrough of every `/app` page and every footer link, run against a local Supabase with a real test account.

- **Dashboard (`/app`)**
  - It greets the candidate by first name. It used to say "Welcome back." to brand-new users.
  - A **"Get set up" checklist** shows live status, in the real order: complete profile → upload CV → read score and tips → explore matches (express interest) → talk to a consultant (optional). It also shows a progress bar and a single "Next:" call to action.
  - Snapshot tiles show CV score, matched roles, roles you're interested in and next consultation. A tile that fails to load says "unavailable right now"; it never shows a misleading zero.
  - The CV and best-matches sections remain. "Also for you" is replaced by four "More for you" cards (roles, HR, messages with unread count, profile and privacy).
- **Profile editing without a double click.** `/app/profile?edit=1` opens the editor directly, and the dashboard's "Complete profile" uses it. Saving or cancelling clears the parameter. The owner reported having to choose "Edit profile" twice; this fixes it.
- **HR page copy.** `/app/hr` said "Sign in to save a private question" to people who were already signed in. The page requires sign-in, so the copy now describes what happens.
- **Footer.**
  - The candidate column now depends on who's viewing:
    - signed out: Register free / Sign in / Open roles / Workplace questions
    - signed in: Dashboard / My CV / Job matches / Consultations
    - staff: Staff dashboard / Candidates / Mandates
  - The duplicate "Create an account" and "Sign up free" links are gone.
- **Privacy and Terms.** Both use a shared `LegalPage` layout: a header clear of the fixed site header (their titles used to collide with it), an "On this page" contents list, and readable sections. **The wording is unchanged.**

Every candidate page loaded without runtime errors in the walkthrough. The four `/services` anchors linked from the footer all exist.

## What the live site is missing (content and configuration, not code)

The walkthrough ran on an empty database, which is what production has today:

| Page | What a new candidate sees | What makes it work |
|---|---|---|
| Consultations | "No consultation times are open right now" | Admin → Consultations: set opening hours and location |
| Job matches / All jobs | "You're all caught up" / "0 roles found" | Post mandates (Admin → Mandates) or run the Reed sync |
| HR library / HR answers | "0 guides" | Approve ACAS sources and publish reviewed FAQ topics |
| Continue with Apple / Google | "…being switched on, use email" | Provider setup (DEPLOYMENT.md) |
| Messages | "No messages yet" | Normal until staff send outreach |

- **Email confirmation.** The owner reports that new users land on the dashboard without confirming their email, which means confirmation is off in UKTL's Supabase Auth. Confirm with the owner that this is intended. The trade-off is unverified addresses in the candidate pool against lower sign-up friction. Outreach already prefers only verified account emails.
- **Staff pages were not walked in this pass.** That needs a named staff account with MFA.

## Checklist for the secondary review

Record results (pass, issue, fixed) in `STAGE_1_UAT.md`, `STAGE_2_UAT.md` or `STAGE_3_UAT.md`. For each page, check:

- It works at **390 px and 1440 px** wide.
- It works in **light and dark** mode.
- It works **keyboard-only**, with focus visible.
- The **empty, loading and error states** are clear.
- **Every link** goes somewhere real.
- The **copy** is candidate-first and invents no facts about the firm.

**Candidate journey, end to end**
1. Register (email; Apple and Google once enabled) → dashboard.
2. Complete profile via the checklist, with no second click needed.
3. Upload a CV → processing state → score and tips → correct the extracted profile.
4. Discover (swipe, keyboard, undo) → My interests → job detail.
5. HR: ask → matched guide or answer → resolution → history.
6. Consultations: book → reschedule → cancel. Check the `.ics` file and both emails.
7. Messages: read state; email preferences on and off; `/unsubscribe` link.
8. Profile: data download, export and erasure requests; sign out; sign back in.
9. Forgot password → reset → sign in.

**Account menu.** Check each item (Dashboard, My CV, Job matches, All jobs, My interests, HR & Law, Consultations, Messages, Profile):
- the active state is correct
- the page is useful when empty
- there is an obvious next action
- nothing on it is broken or unfinished

**Footer and public pages.** Check `/`, `/approach`, `/services` (including its four anchors), `/sectors`, `/reach`, `/contact` (the form submits and the email is delivered), `/privacy`, `/terms` and `/unsubscribe`:
- The owner wants each page to feel fully built: complete sections, real contact details, consistent headers and spacing, and a clear next step at the end.
- **Privacy and Terms still need owner or legal-approved wording** before launch (see DEVELOPMENT_GATES.md, Gate 4). Do not invent company numbers, ICO registration, retention periods or legal terms. Get them from the owner.

**Staff journey (with MFA).** Check `/admin` overview and every admin section, `/app/candidates` and a candidate record (outreach), and `/app/jobs/:id` pipeline stages:
- mandate post → rank → add to pipeline → fill → reopen
- CSV exports
- analytics charts

## Afterwards

1. Delete this file.
2. Update CLAUDE.md "Known gaps" if anything remains unbuilt.
3. Keep devacnt and JSHrs `main` in sync.
