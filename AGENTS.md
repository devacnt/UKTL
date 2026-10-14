# Architecture decisions

- Session/OAuth cookies get their SameSite policy from `src/lib/server/cookie-policy.ts`: partitioned SameSite=None on Lovable preview hosts, Lax everywhere else — the editor embeds previews in a cross-site iframe where Lax cookies are dropped, so sign-in never sticks there.
