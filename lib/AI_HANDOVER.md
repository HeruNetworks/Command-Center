# Heru Command Centre — shared AI handover

Read this file, list_deployments, and re-read any live file before editing. This project is private and its APIs are admin-only. Do not loosen access or publish account data to public files.

## 31 Oct 2026 — v46 — Claude (Claude Code session) — 07:00 nudge moved to Telegram

Mario asked to move the 07:00 email to the new Heru Books Bot (proj_0PHQdZRGfIHZ, @WhirlingMerlinBot). Restore point: v45 (nudge.js identical to GitHub herunetworks/command-center commit 8eecd21).
- api/jobs/nudge.js only: after building the text, POSTs it to meta bot_notify_url with header x-bot-key = meta bot_notify_key. The bot stores only the key's SHA-256 and sends to active OWNERS only. If Telegram fails, the old email path runs unchanged; nudge_status says "Sent to Telegram" or "Sent by email (Telegram failed: ...)".
- No schema change; two meta rows added (bot_notify_url, bot_notify_key). Never print or copy bot_notify_key.
- Tested: force run -> sent via Telegram ("Board: 3 overdue").

## 27 Oct 2026 — v42 — Claude (App Builder chat, session_01NVePquo1BVLg2QsWjCVTVN) — Send by reference (brief step 4)

Mario said "Go" and chose shiftlog.uk as the sender for every document email (option 1). Restore point: v41 (= GitHub commit 8eecd21). Drive note: App Backups > Heru Command Centre > 2026-10-27-1700-before-send-by-reference - BACKUP-MANIFEST.md.
- Why a relay: this project has no verified email domain, and @herunetworks.co.uk only allows Google to send. ShiftLog (proj_msHd9NEv31HI) owns shiftlog.uk, so it sends for us: new ShiftLog route api/relay/doc-mail (ShiftLog v88), same pattern as Heru Sign's sign-mail. Shared secret DOC_RELAY_KEY (new, optional) must be pasted with the SAME value on both projects' Setup pages; until then send returns 412.
- Drive cannot be the source of the bytes: alt=media downloads fail through the google_drive proxy (tested 27 Oct, gateway 500). So each document's file is uploaded ONCE into app storage (docs/<id>/<uuid>.<ext>) and sent from there. Drive stays the main copy.
- migrations/024_document_files.sql: documents.file_key, file_sha256, file_bytes, file_type, file_at, sends JSONB (log of every send attempt: at, ok, to, cc, subject, from, message_id, docs, error).
- lib/docfiles.js (new): limits (file 10 MB, one email 7 MB / 10 files), type check by first bytes (PDF, JPEG, PNG, docx/xlsx by name), base64 via node:buffer.
- api/documents/file.js (new, admin): POST parts {id, upload_id uuid, part, parts, data base64 <= ~2.9M chars} then {finish: true, file_name}; joins, checks type, sha256, stores, deletes parts and the old copy. GET ?id= -> 302 to a 60 s signed URL.
- api/documents/send.js (new, admin): POST {doc_ids, to, cc, subject, text, from_name "Heru Networks Ltd" | "ZS Cabling Ltd", approved_by_mario: true, confirm: "send", allow_old, allow_draft, resend}. Refuses (403) without BOTH approval fields: a chat sets them ONLY after Mario typed "send" for that exact email. Refuses superseded/draft unless allowed, a repeat of the same email within 10 min (409), missing stored file (409), over 7 MB (413). Sends via relay, logs on every document, marks sent (draft/final -> sent).
- lib/docs.js DOC_SELECT adds has_file, file_bytes, file_type, file_at, sends.
- public/documents.html: buttons Open, Download, Send, Share, My email app (old mailto), Attach file / Replace file, Mark as sent, Edit. File line and send log on each card. Send dialog: documents list (+ attach another, old/draft excluded from the picker), From name, To, CC, Subject, Message prefilled "Greetings ," + list + Mario's signature (Heru only); blocks an empty Greetings name; Send stays disabled until "send" is typed. Version guard still runs first.
- hatchable.toml: [[secret]] DOC_RELAY_KEY (required = false).
- How a chat sends: upload with run_function POST /api/documents/file (small files only; big ones: Mario taps Attach file on his phone), show Mario the final email, wait for "send", then run_function POST /api/documents/send with approved_by_mario true and confirm "send".

Tested: local Playwright 320/390/1440 with mocked API, 60/60 (no overflow, no errors, send gating, Greetings check, two docs, old version allow_old, 7 MB cap, 3.5 MB upload in 3 parts byte-identical). Live: anonymous send/file 401; no approval 403; no file 409; two-part upload out of order joined, sha256 matched; junk file 415; approved send 412 (no key yet); stored copy 302; base64 round trip checked; test file deleted and doc #6 restored. ShiftLog relay with a wrong key 404; sign-mail unchanged. NOT tested: a real send (needs the key, then Mario's "send"), a real phone upload.

## 28 Oct 2026 — v44-v45 — Claude (Claude Code session) — offline mode (option B: read and edit with no signal)

Mario chose option B (read and edit offline). Restore point: v43 (GitHub commit "Mirror live v43 files" on branch ccr-bc71b69f-u1x735). No API, schema or data changes.
- public/sw.js (new): service worker. Pages/CSS/JS network first (4 s) else saved copy; GET /api/* network first (8 s) else saved copy with headers X-HCC-Offline and X-HCC-Saved-At; /api/documents/* (file downloads) never cached; /api/photos?key=pending/... served from the phone queue, other photos cached after first view. Bump VERSION when changing it.
- public/offline.js (new, first script in the head of index, checklist, pay, documents, map, usage): wraps window.fetch. POSTs to /api/update and /api/photos made offline (or while anything is still queued) go into IndexedDB "hcc-offline" and get a made-up success reply; sent in order when online (online event, page open, every 30 s after a failure; one tab at a time via navigator.locks). item_add/pay_add offline get a negative temp id; photos get key pending/<uuid>.jpg; both are swapped for the real id/key when sent (maps in meta "ids"/"keys"). Pending changes are laid over saved /api/board and /api/lists data. 4xx = dropped and shown in a red banner; 401/403 = "Signed out, sign in again"; 5xx/network = retried. Documents and usage writes need signal (clear message).
- Pages: index/pay/checklist reload on the "hcc-synced" event; checklist says "photo saved on the phone" and hides Copy to Drive for pending photos.
- Known limits: last change wins (a whole checklist save offline overwrites edits made elsewhere meanwhile); nothing is sent until the board is opened again with signal (no background sync on iPhone); the board must have been opened once with signal on that phone.

Tested: local Playwright 320/390/1440 with a mock API: offline reload shows saved board, checklist and pay list; offline add + tick of the new item + tick of an old item + checklist result + photo -> 5 queued -> online -> sent in order, temp id and photo key swapped, Drive id kept, thumbnail works before and after; rejected change shows red banner; no overflow or page errors. Live (v44-v45): all files deployed and hashes match the tested copies; signed-out requests to sw.js/pages redirect to the Hatchable login and /api/board gives 401 (unchanged). v45: sw.js leaves /__hatchable/ (sign-in) alone. Not tested: signed-in phone (Mario to test with flight mode), iPhone Safari.

## 27 Oct 2026 — v40-v41 — Claude (Claude Code session) — checklist photos copied to Google Drive

Mario chose Drive for checklist photos. Restore point: v39 (GitHub commit 96450d1). This code: commit after 79c2d1d.
- hatchable.toml: [[api]] google_drive (oauth2, drive scope), same block as Cable Log and ShiftLog. NOT CONNECTED until Mario clicks Connect on this project's Setup page (sign in as mario@herunetworks.co.uk). Cable Log's connection works, so the Google app credentials should be reused.
- lib/drive.js (new): folder find-or-create (ids cached in meta key drive_folder:<parent>:<name>), binary multipart JPEG upload (same as Cable Log lib/drive.js). Only adds; never deletes, moves or shares. PROJECT_FOLDERS maps ZS Cabling to "05 ZS Cabling (admin we do for them)"; other projects use 00 Inbox until Mario names folders.
- api/photos.js: every photo is still stored in app storage (thumbnails), then copied to Drive: <project folder>/Checklist photos/#<item> <title>/"<full name> - <date> - <what> - <HHMMSS>.jpg". Drive failure never loses the photo: response has drive_error. POST {item_id, retry_key, ...} copies a saved photo later. Photo objects carry drive_id (kept by checklist_save).
- public/checklist.html: thumbnails open the Drive copy when there is one; "Copy to Drive (n)" on rows with photos not yet in Drive; message when Drive is not connected.
- Test data: two tiny test JPEGs in app storage under checklists/576/ (not on any row, not in Drive).

Tested: local Playwright 320/390/1440 (Drive not connected message, Copy to Drive, Drive link on thumbnail, no overflow or errors). Live: upload 200 with drive_error while not connected, unsaved retry_key 404, anonymous 401. Not tested: a real Drive upload (needs Mario's Connect), real phone camera.

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