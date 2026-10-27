# Heru Command Centre — shared AI handover

Read this file, list_deployments, and re-read any live file before editing. This project is private and its APIs are admin-only. Do not loosen access or publish account data to public files.

## 27 Oct 2026 — v38 — Claude (Claude Code session) — checklist photos and full names

Mario asked for photos taken straight from the checklist and full names always. Restore point: v37 (GitHub commit 44d37d6). This code: commit c36f890.
- api/photos.js (new, admin): POST JSON {item_id, data: JPEG data URL} -> checks magic bytes, max 5 MB, stores at checklists/<item>/<uuid>.jpg in private app storage, returns {key, at}. GET ?key= only if that key is saved on that item's checklist_rows, then 302 to a 60-second signed URL. Photos are not copied to Drive; a chat can copy them when building an evidence pack.
- api/update.js checklist_save keeps row photos [{key, at}] (keys must match checklists/<that id>/<uuid>.jpg, max 20 per row).
- api/lists.js ?checklist also returns people: full names already used (checklist persons and payees with two or more words).
- public/checklist.html: Take photo per check (camera, shrunk on the phone to 1600 px JPEG 0.8), thumbnails open full size; person field suggests full names, warns on a single name, FULL NAME? badge, tap a name to correct it.
- Data: #576 persons changed to full names from records (Ozgur Koz, Andrii Reznichenko, Niamatullah Nabizada, Mahli-I Congo-Nyah, Reece Henry; Mark's surname MISSING). #566 payee Andrii Reznichenko. One 8x8 test JPEG left unlinked in storage (checklists/576/ac894d49-...jpg).

Tested: local Playwright 320/390/1440 (real file through the camera input, thumbnail, save keeps photos, warnings, no overflow or errors). Live: POST 200, non-JPEG 415, anonymous 401, unsaved key 404, stored file opens; checklist page shows the photo buttons. Not tested: a real phone camera.

## 27 Oct 2026 — v36 — Claude (Claude Code session) — site checklists and ZS pay list

Mario said "Go" to steps 3 and 4. Restore point: v35 (exact files in GitHub HeruNetworks/Command-Center commit 5285dae; Drive note 2026-10-27-before-checklist-and-pay-list.md). Shipped in one deploy, not two.
- migrations/022_item_checklist.sql: items.checklist_rows JSONB [{person, date, look_for, result "" | ok | issue | na, note}]. 023_item_pay.sql: items.amount_gbp NUMERIC(12,2), payee, invoice_ref, pay_on, paid_on. No bank details, ever.
- lib/rules.js: KINDS gains "checklist"; CHECK_RESULTS, okMoney (server parses money), payFriday (today if Friday, else next Friday, UK).
- api/update.js new actions: checklist_save (whole list, max 100 rows, sets kind checklist), pay_set, pay_add (new ZS Cabling item), pay_paid (paid_on date required, not future; also ticks the item; paid:false undoes).
- api/lists.js (new, GET, admin): ?checklist=<id> and ?pay=1 (items, server totals: unpaid, due by Friday, paid last 60 days).
- api/board.js: items select adds the new columns; pay totals for Home in a try/catch.
- public/checklist.html, public/pay.html, public/lists.css (new). public/index.html: "Checklists for today" pinned above "these need you" (kept out of that list), ZS pay strip under Recent documents, CHECKLIST n/m and £ badges on items, Open checklist / Pay list buttons, ticking a pay item asks the paid date (pdDlg), Site checklist in the Add/Edit type lists.
- Calendar: the app cannot touch it. A chat removes the reminder when it sees paid_on set (parked in skill_fixes for command-centre-update). Nothing is ever paid from the app.
- Data: #576 converted to a checklist (10 rows from its text); #566 Andrii INV-0000013 £950.00 pay 30 Oct; #485 Archite SI-278 £3,645.00, no pay date (held until ZS says go).

Tested: local Playwright 320/390/1440 with mocked API (pins, no duplicate in focus, badges, checklist save and result toggles, mark paid, add payment, no overflow, no page errors). Live: anonymous /api/lists 401; owner checklist_save, pay_set, lists?pay=1 200 with correct totals; screenshots of Home, checklist, pay list, map; no error logs. Not tested: physical phone.

## 27 Oct 2026 — v33-v35 — Claude (Claude Code session) — Documents page and version guard

Mario approved steps 1 and 2 of the Documents brief only (steps 3 checklist and 4 pay list need his go). Restore point: v32 (full code backup in Drive App Backups > Heru Command Centre > 2026-10-27-before-documents-page, and in GitHub HeruNetworks/Command-Center branch ccr-a88bf7ef-h7nhsp).
- v33 step 1. New: migrations/020_documents.sql (table documents: an index of Drive files, never the files), 021_documents_idx.sql, lib/docs.js (kinds, statuses, DOC_SELECT, DOC_WAITING, driveId), api/documents.js (GET filters project/kind/status/tag/q/waiting, POST add, PATCH edit / action "sent" / action "replied"; access admin like the other routes), public/documents.html (search, filter chips, Waiting box, Open / Download / Email / Share / Mark as sent / Edit, old versions hidden). Changed additively: api/board.js returns docs {recent, waiting, by_item} inside a try/catch so the board never fails on it; public/index.html adds the Recent documents strip under "these need you" and DOC #n chips on items (docStrip, docsFor); api/map.js gives map_nodes rows of kind doc whose url contains /documents.html a live count and hides projects with none. map.html, universe.js, universe.css and theme.css untouched.
- Superseding: a row is superseded if any row has supersedes_id = its id (worked out in DOC_SELECT, so rows inserted by SQL from a chat are covered); the API also stores status 'superseded' on the old row. replied_at column added (not in the brief) so "sent, no reply yet" can be cleared.
- Email = two taps in a dialog (1 Download PDF, 2 open mailto draft with subject = title, body = description). No Drive link in the email. Nothing is sent from the app. Share = Web Share API with the Drive link plus warning, Copy link fallback.
- v34 fix: list ORDER BY mixed text and date (500). Home strip sorts by document date.
- v35 step 2: version guard in documents.html (Email/Share/Download on a replaced document offers the newest in the chain; drafts warn before Email or Share).
- Data: documents #1-#6 backfilled (9-day ECMWF pack, EmbersTech INV-690, INV-690-2, INV-694, INV-696, INV-2026-0060). 8 map_nodes rows "Documents · <area>" (kind doc). Not backfilled (not found in Drive, asked Mario): the older 10-day pack and the EmbersTech statement of account DRAFT 27 Oct.

Tested: local Playwright at 320/390/1440 with mocked API (no overflow, no page errors; add, mark sent, filters, old versions, guard chain and draft warning). Live: anonymous GET /api/documents, /api/board, /api/map return 401; owner GET/POST 200/201; supersede SQL checked; live screenshots of documents.html (320/390/1440), Home and Map via browser.screenshot. Not tested: physical phone Email/Share (Mario to try), PATCH from a real browser session.

## 27 Oct 2026 — v32 — ChatGPT / Codex — direct phone pinch zoom

Mario requested pinch zoom instead of relying on +/- buttons. Restore point: v31.
- The star scene reserves touch gestures immediately: spread two fingers to zoom in, pinch together to zoom out, drag one finger to orbit. Removed the Explore/Exit Explore gate and updated gesture help. Page gestures outside the star scene remain available.
- Touches beginning on project labels now reach camera handling. Pointer capture stays on the original touched element so a simple tap still activates its destination; mouse button clicks keep their existing handling. Guarded zero-distance pinches.
- Kept +/- and Reset as alternatives. Bumped universe asset query versions to v2.
- Only public/universe.js, public/universe.css, public/map.html and this handover changed. No board, APIs, databases, permissions or data changes.

Tested: managed Chromium phone/touch viewports at 320, 360 and 390 px, using the exact changed source and a minimal read-only rendering fixture. Eleven checks per width passed: direct readiness, no activation button, pinch both directions (including starting on a label), drag rotation, reset, project navigation, outside-scene gesture CSS, no horizontal overflow, no page errors, no API writes. Synthetic pointer capture was stubbed solely in the test fixture because synthetic pointer IDs have no native capture.
Not tested: physical phone/multitouch hardware, Safari/iOS, signed-in browser session, live mutation flows. This is a contained gesture/presentation change.

## 26 Oct 2026 — v31 — ChatGPT / Codex — interactive universe and board redesign

Mario authorised the redesign after reviewing the previous flat orb. Restore point: Hatchable v30. No API, schema, migration, auth, stored task, routine or account changes.

Files: public/universe.js and public/universe.css are new. public/map.html integrates the scene while keeping its existing build(), panels, directory search, activity timeline, detail-sheet HTTPS links and view storage. public/board-skin.css is new; public/index.html changes home presentation and the Add location. The shared public/theme.css is untouched.

Universe:
- Native WebGL point stars and constellation connections, real perspective orbit/zoom camera, eased project travel and selection. Deterministic procedural geometry, no raster assets or external JS dependencies.
- Desktop drag and wheel; arrow keys, +/- and Home when scene has focus; visible zoom/reset buttons. Phones require Explore before touch orbit/pinch, so normal page scrolling remains available outside Explore. Exit Explore restores normal gestures.
- Eight project clusters use existing project data. Apps are collected under App Builder for browsing only; their stored project/category is not changed. The inspector always lists every destination, including those hidden by label-collision handling.
- Existing /api/map feeds nodes, apps, skills and routines; an additional read-only /api/board GET supplies overdue counts. Overdue badges and pending skill fixes are driven by records, not decorative fake activity. Core/star motion is ambient decoration.
- Auto/Light/High effects, device-pixel-ratio caps, fewer stars on phones, pause when hidden or on another tab, reduced-motion snap travel with idle orbit off. Real 3D perspective Canvas 2D fallback if WebGL is unavailable; a context-loss message leaves project lists usable. Graphics quality is saved locally.

Board:
- Next three existing items, deduplicated and ranked overdue -> due soon -> open questions, respecting project filter. Existing item controls and mutations are reused.
- All eight original counters retained behind Workspace at a glance. Reviews, sync and housekeeping retained in a collapsible section; nudge failure alerts remain visible.
- Current chats, full task/project/app views, dialogs, links and actions retained. Add is in the fixed bottom navigation dock, not over a task. Universe links in home and dock.

Validation before deployment:
- Syntax checks for both inline scripts and universe.js.
- Managed Chromium with exact source and current owner API response data (only fixture fetch is substituted; test payloads never uploaded).
- 20 camera/navigation checks: zoom in/out, wheel, arrow/Home, project fly-in, Cable Log detail + original HTTPS link, close/focus, search, activity, pause while tab hidden, quality settings, no page/console errors or writes.
- Additional simulated mouse drag and idle auto-orbit; WebGL getError() = 0.
- Nine phone gesture checks using simulated pointer events: normal touch before Explore does not rotate, Explore sets touch-action:none, one-finger orbit, two-finger pinch, Exit Explore, reset, no overflow/errors/writes. Browser viewports use mobile/touch mode.
- Layouts at 320/360/390/768 and desktop 1440 px. At 320 some projected labels are intentionally suppressed to avoid collisions; all projects remain available in inspector/chips/directory.
- WebGL-disabled perspective fallback and reduced-motion startup both zoom correctly, no errors/overflow; reduced motion has no idle animation frame loop.
- 18 board checks: three priorities, deduplication, counters/housekeeping, Add open/cancel, existing Home/Chats/Tasks/Projects/Apps navigation, project filter, dock position, no errors/writes. Board at 320/360/390/768/1440 px has no horizontal overflow.
- Owner GET /api/map and /api/board returned 200; anonymous requests returned 401 before deployment.

Not tested: physical phones, actual multi-touch hardware, long battery/GPU profiling, real signed-in browser session, or live mutation/save flows. Existing write handlers were not changed or invoked against real data. Do not describe simulated gesture tests as physical-device tests.

Post-deployment: v31 confirmed live and private, no deploy warnings. The real hosted universe.js, universe.css and board-skin.css loaded successfully in managed Chromium; project fly-in and the Cable Log destination were verified using current response data in a read-only rendering fixture. Live-asset layouts at 320/390/1440 px had no overflow or page/console errors; the board showed its three priorities and loaded its hosted skin. Owner GETs to both APIs still returned 200; anonymous GETs returned 401. Deployment manifests confirm only the six frontend/handover files above changed, with no deletions and unchanged backend, migrations and permissions.