# LESSONS.md — Mistakes I must not repeat

Read this before every task. Newest lessons at the bottom of "All Lessons".
Never put passwords, API keys, or customer data in this file.

## Top Rules (repeated or high-risk — follow always)

- NEVER put the Supabase service_role key, or any secret, in front-end code or in a NEXT_PUBLIC_ variable.
- ALWAYS turn on RLS and write its policies in the same migration for every new table.
- ALWAYS run the Done Check (LESSONS-SPEC.md Section 5) before saying "done".
- NEVER rewrite 01-SPEC.md / SPEC.md. Edit in place, and only when asked.
- ALWAYS screenshot every changed page at 360 px and run scripts/check-text-fits.mjs before saying done (phone layouts broke 4 times: L-002, L-010, L-011, L-013).

## Starter Rules (Next.js + Supabase + Vercel)

- ALWAYS make database changes as migration files, never by editing in the Supabase dashboard only.
- ALWAYS add a new env variable in three places: .env.local, .env.example (name only, no value), and Vercel project settings.
- ALWAYS store dates and times as timestamptz (UTC) and show them in Asia/Manila time.
- ALWAYS add "use client" only to files that need browser features (clicks, state, window). Keep everything else on the server.
- ALWAYS check what a file does before changing it. NEVER change files outside the current task without asking.
- ALWAYS add new text to every app language file (no hard-coded English in screens).
- ALWAYS ask Earvin when the spec is unclear. NEVER guess a business rule.

## Rules from Earvin's other apps (imported 2026-11-27, trimmed)

From the pack "Earvin-App-Lessons-2026-11-28" (≈190 lessons from 15 apps). Kept only what fits Next.js + Supabase + Vercel + the Capacitor Android app. Left out: Expo/EAS/OTA, React Native, Windows laptop setup, Game Night and quiz content. Archive numbers (#) are in brackets.

### Before building
- ALWAYS search for an existing app, page or feature before making a new one. [#154]
- ALWAYS ask these in one message before the first code of a new app: phone app or website; exact phone (photo of Settings → About phone); one or several devices; logo and exact app name; push notifications; paid APIs (cost per run). [pre-flight, #151, #156, #157]
- ALWAYS map every numbered spec section to a build phase, and name any section no phase covers. [#152]
- ALWAYS search the app for a word before using it as a new screen or button name. [#189]

### Proving it works
- ALWAYS run it, show Earvin real screenshots and click the whole flow, last button included, before saying done or building an APK; code that "looks right" is not done. If it cannot be seen, say "unverified" and why. [#125, merged with the old starter rule]
- ALWAYS prove which part failed (browser, server, database, network) before changing anything. [#147]
- ALWAYS stop explaining when the same bug comes back twice; read the code, data and logs instead. [#136]
- ALWAYS query the real table before claiming something ran, saved or exists. [#71, #72]
- ALWAYS watch a new test fail on the old code before trusting it, and assert exact numbers away from limits. [#129–#134, #187]
- ALWAYS fix the test clock where the code actually reads the date, and check the test setting really arrives. [#182]

### Silent failures
- NEVER write a silent try/catch; show or log every error. Every await that blocks a screen gets a timeout and a fallback. [#120]
- ALWAYS finish the file upload and check the file exists before saving the row that points to it. [#117, #163]
- ALWAYS read back any file you create (export, backup, APK): size above 0 and it opens. [#83, #118]
- ALWAYS show a setup message naming the missing setting, never a blank screen, when an env variable is missing. [#121]
- NEVER use the browser's confirm() or alert() for real choices (they fail in the Android app); use an in-app dialog. [#119]

### Data
- ALWAYS make saves safe against double taps: disable the button while saving and use a unique key. [#67, #85]
- ALWAYS refresh the page data after a save, so changes show without logging out. [#86]
- ALWAYS give a new column a DEFAULT, fill old rows, and fix the insert path; test a row made after the migration. [#77, #78]
- ALWAYS update every check rule and every reader of a field in the same commit when its list of values changes; search for each field name. [#65, #89, #92]
- ALWAYS page past 1,000 rows when reading from Supabase (it stops at 1,000 by default). [#69]
- ALWAYS give bulk imports a result per row, so one bad row does not undo the rest. [#70]
- ALWAYS save the unit (₱, kg, pcs) with the value and use one formatter per unit. [#66, #90]
- ALWAYS check "overwrite or merge?" before re-running a script on live data. [#75]
- NEVER let a script or test act as a real user; use the marked test accounts. [#36, #73]
- ALWAYS use one shared Manila-date helper for "today" and "this week"; NEVER take the date from an ISO string. State whether the boundary day is in or out and test it. [#56, #57, #59]
- ALWAYS keep "0" and "nothing" apart: show "—" for no value and test both cases. [#79, #170]
- ALWAYS compare item counts before and after a change that filters or splits a list. [#39]

### Screens
- ALWAYS check on a phone-size screenshot that every page scrolls and bottom buttons are not hidden under the Android navigation bar; NEVER hardcode bottom heights. [#37]
- ALWAYS autosave long text fields as drafts, so typing survives leaving the page. [#40]
- NEVER call router.back() alone; give a fallback page for when there is no history. [#41]

### Android app
- ALWAYS raise the version on every APK and show the version and build date in the app. [#11, #19]
- ALWAYS sign with the same key (backed up off this computer); a new key forces an uninstall and data loss. [#12]
- ALWAYS read permissions and version from the built APK, not from the config. [#13]
- ALWAYS say for each change: "website only, the app updates by itself" or "needs a new APK". [#18]
- ALWAYS read the full build log from the first warning before retrying a failed build. [#5]
- NEVER hand-edit files a tool generates (android/ folder); change the config and re-run the sync. [#21]

### Working with Earvin
- ALWAYS give the exact link, exact menu path, and what success looks like. [#150]
- ALWAYS ask for a screenshot or photo (browser, phone model) when a bug happens only on his device. [#43, #151]
- ALWAYS say where a new password or key is saved in the same message, and tell him to store it in his password manager. [#155]
- ALWAYS keep the build status file current, so "continue" resumes cleanly. [#148, #159]

## All Lessons

### L-001 · 2026-11-25 · Go-live · [server]
- What happened: Reminders and app emails were never sent after go-live.
- Root cause: The sign-in gate (middleware) redirected the database's /api/cron calls to the login page.
- Rule: ALWAYS add every route called without a user (cron, webhooks, /.well-known, downloads) to the middleware's public paths.
- Check: Call the route without cookies; it must answer itself (JSON/403), not show the login page.

### L-002 · 2026-11-25 · Phone UI · [ui]
- What happened: On phones most pages could not be reached; the top bar grew huge on short pages; the ☰ sheet sat under the bottom bar.
- Root cause: No full menu on phones; wrapping flex rows stretch to min-h-screen; an overlay inside the sticky header was trapped in its layer.
- Rule: ALWAYS give phones a ☰ menu to every page, use content-start on wrapping layouts, and portal full-screen overlays to document.body.
- Check: At 320 and 360 px, screenshot short pages and tap every ☰ item.

### L-003 · 2026-11-26 · Phone UI · [ui]
- What happened: React error #418 (hydration) on My profile.
- Root cause: Read navigator (browser-only) while rendering, so the server and the phone rendered different text.
- Rule: NEVER read window/navigator during render; read them in useEffect and keep the result in state.
- Check: Open the page and confirm no page errors in the browser console.

### L-004 · 2026-11-26 · Android app · [deploy]
- What happened: App 1.0 opened Firefox; app 2.0 could drop sign-in cookies.
- Root cause: 1.0 was a Trusted Web Activity (hands the page to a browser); 2.0 used Capacitor server.url, whose local relay loses Set-Cookie on redirects.
- Rule: NEVER use a browser hand-off, Capacitor server.url or allowNavigation for the live site; load it directly in the WebView (see mobile/README.md).
- Check: Read mobile/README.md before changing the app shell.

### L-005 · 2026-11-26 · Android app · [deploy]
- What happened: The phone kept reinstalling the old app.
- Root cause: Every release had the same file name; phones keep office-hub.apk, office-hub(1).apk… and the oldest was opened.
- Rule: ALWAYS name the app file with its version (office-hub-X.Y.apk) and show the version on /download.
- Check: /download link, file name and versionName all match.

### L-006 · 2026-11-26 · Android app · [login]
- What happened: Fingerprint set-up in the app always said "Cancelled".
- Root cause: Browser passkeys are unreliable inside an Android WebView, and every error was shown as "Cancelled".
- Rule: ALWAYS use the phone's own fingerprint prompt in the app (QuickUnlock), and NEVER show one message for every kind of failure.
- Check: Run the simulated-phone test: set up, wrong signature refused, right one unlocks.

### L-007 · 2026-11-26 · Testing · [testing]
- What happened: A browser test failed although the app was right.
- Root cause: [role="alert"] also matches Next.js's empty route announcer, and fixed pauses raced the server.
- Rule: ALWAYS target the app's own element (p[role="alert"]) and wait for the result, never a fixed pause.
- Check: Run the test twice; both runs must pass.

### L-008 · 2026-11-25 · Database · [database]
- What happened: Several SQL functions failed when first applied.
- Root cause: Set-returning functions inside CASE; `text[] || 'x'` read as an array; a security_invoker view could not read hidden columns.
- Rule: ALWAYS use `union all … where` instead of CASE around set-returning functions, array_append for one item, and a definer security_barrier view with an explicit access filter for masked data.
- Check: Apply the migration, then call each function as a test user.

### L-009 · 2026-11-25 · Security · [security]
- What happened: Time in trusted a selfie path sent by the phone.
- Root cause: The server did not check the file really existed in storage.
- Rule: NEVER trust a file path from the browser; check it in storage.objects (owner and folder) on the server.
- Check: Try a fake path as a test user; it must be refused.

### L-010 · 2026-11-26 · HR settings · [ui]
- What happened: New settings screens showed "08:00 AN" (time cut) and a checklist dropdown ran past its card; long names were cut in dropdowns on phones.
- Root cause: Time boxes too narrow for 16 px phone text; a row of fields with no wrap; long option text in a native dropdown on a 360 px screen.
- Rule: ALWAYS give time boxes at least 9.5rem, let field rows wrap, and NEVER put long text in a phone dropdown (use wrapping choice buttons, or show the name only).
- Check: node scripts/check-text-fits.mjs (all pages, then OPEN=1) prints PASS, and look at the 360 px screenshots too; the script alone missed problems (merged L-012).

### L-011 · 2026-11-26 · HR settings · [ui]
- What happened: An empty gap appeared under every settings card title.
- Root cause: Hidden inputs were wrapped in <span>s inside a flex column with gap, so each empty span added a gap.
- Rule: ALWAYS put hidden inputs directly in the form (or a Fragment), NEVER inside an element in a gap layout.
- Check: Screenshot the form and look for blank space under the title.

### L-013 · 2026-11-26 · Calendar · [ui]
- What happened: On phones the new calendar grid was invisible (zero height); only the side panel showed.
- Root cause: flex-[3_1_0] (basis 0) meant for the side-by-side computer layout also applied in the stacked phone column, so the grid shrank to nothing.
- Rule: ALWAYS put flex sizes for side-by-side layouts behind the same breakpoint as the row (e.g. min-[1100px]:flex-[3_1_0]), never on the stacked phone version.
- Check: Screenshot the page at 360 px and confirm every section has height.

### L-014 · 2026-11-26 · Trial sign-in · [login]
- What happened: One-time sign-in links for the testers said "expired or already used" in Chrome.
- Root cause: The link signed in on a plain visit (GET); Chrome loads pasted links in advance (and email/chat apps preview them), which used up the one-time link first.
- Rule: NEVER use up a one-time token on a GET; show a page with a Continue button and sign in on the POST.
- Check: Open the link twice with a plain request, then tap Continue: it must still sign in.

## Archive

### L-012 · 2026-11-26 · Testing · [testing]
- What happened: The first text-overflow scan missed problems found by eye.
- Root cause: It skipped time fields and closed Edit sections, and did not check boxes pushed past their card edge.
- Rule: ALWAYS run scripts/check-text-fits.mjs (all pages, then OPEN=1) after UI changes, and ALWAYS look at the screenshots too.
- Check: The script prints "PASS: all text fits its boxes".
- Archived 2026-11-27: merged into L-010 (same rule: run the text-fit script and look at the screenshots).
