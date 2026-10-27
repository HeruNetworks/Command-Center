# Heru Command Centre — shared AI handover

Read this file, list_deployments, and re-read any live file before editing. This project is private and its APIs are admin-only. Do not loosen access or publish account data to public files.

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