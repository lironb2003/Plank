# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

Follow this for every session; it is the default unless I say otherwise in that session.

**Branching** — do all work on `dev`, branched from `origin/main`. Commit and push to `dev` as you go (`git push -u origin dev`) — every commit, not one squashed push at the end, so I can follow along on the Netlify branch deploy. Never push to `main`: I merge `dev` into `main` myself once I'm happy with it. Don't open a PR unless I ask. If `dev` has already been merged and I ask for something new, reset it onto the latest `main` (`git fetch origin main && git checkout -B dev origin/main`) rather than stacking on merged history.

**Before pushing a UI change**, verify it actually runs — the JSX is compiled in the browser, so a syntax slip or a bad render only surfaces at load time, never at commit time:

1. Serve the repo (`npx -y serve -l 8123 .`, matching `.claude/launch.json`) and drive it with Playwright + the pre-installed Chromium at a phone-sized viewport (~390×844).
2. Check the console is clean — no Babel compile error, no runtime exception, no unhandled rejection. A blank page with a console error is the normal failure mode here.
3. Screenshot the screens you changed at that viewport and attach them to your reply.
4. Run `/code-review` on the working diff and fix what it turns up before committing.

Skip steps 1–3 only for changes with no visual surface (docs, comments, config) — say so when you skip.

**House style**

- Mobile-first: judge every UI change at ~390px wide first. Desktop is secondary; a layout that only looks right on a wide screen is wrong.
- When a change adds or reshapes structure — a new component, page, storage key, state machine, or catalog — update the Architecture section below in the same commit. It is the map I rely on next session; a stale map is worse than none.
- Write the code the way it should be. Don't contort a design to preserve the current file layout (see Constraints).

## Overview

A mobile-first abs workout timer, deployed as a static site (GitHub Pages, per the git history's CNAME commits). `index.html` is a shell that loads the app from `src/` as browser-compiled JSX, alongside an optional `sw.js` (notifications only). There is no build step, no package.json, no linter, and no tests.

## Running it

Serve the directory — `python -m http.server`, or `npx -y serve -l 8123 .` to match `.claude/launch.json` — and open it. Changes take effect on reload. Opening `index.html` over `file://` does **not** work: Babel fetches the `src/` scripts over XHR, which needs an HTTP origin.

## Architecture

`index.html` loads React 18, ReactDOM, and Babel Standalone from cdnjs, then lists the app's own files as `<script type="text/babel" src="…">` tags that Babel fetches and compiles in the browser at runtime.

These are **classic scripts, not ES modules** — there is no bundler to resolve imports, so every file shares one global lexical scope, exactly as if they were still one script. Two consequences worth knowing before editing:

- **A name may only be declared once across the whole app.** A second `const styles` (or `useState`, or any other top-level name) in a different file is a redeclaration error that blanks the page. React's hooks are destructured once, in `src/ui/components.js`.
- **The `<script>` order in `index.html` is the dependency order.** Babel runs the files in the order they appear there: data → lib → ui → pages → main. Anything that *executes* at load (`src/lib/search.js` hanging a search haystack off `GYM_EXERCISES`, `src/main.js` rendering) must come after what it touches. Adding a file means adding a tag in the right place.

The file map:

| File | Holds |
| --- | --- |
| `src/data/library.js` | `LIBRARY` catalog, `BUILTIN_PRESETS`, `resolveEntry`/`withUids`, `GET_READY`, the presets storage key |
| `src/data/gym-exercises.js` | `GYM_EXERCISES` catalog (EN/HE) and the three gym storage keys |
| `src/lib/schedule.js` | `buildSchedule` / `segmentAt` — the flat segment list the timer plays back |
| `src/lib/audio.js` | Cue synthesis: `tone`, the note vocabulary, `CUES`, `playCue`, `CUE_HORIZON` |
| `src/lib/platform.js` | Mobile workarounds: the silent keep-alive loop, `notifySupported` |
| `src/lib/search.js` | Normalization + `fuzzyScore` over the gym catalog |
| `src/lib/store.js` | The `store` adapter, Firebase config/init, the local→cloud preset merge |
| `src/ui/styles.js` | Every inline style, as one `styles` object |
| `src/ui/components.js` | React hook globals; `Skeleton`, `SkeletonCard`, `HomeButton`, `Stepper` |
| `src/pages/abs-timer.js` | `THEME`, `ROW_H`, `AbsWorkoutTimer` — setup flow, timer engine, cue scheduling, background handling |
| `src/pages/gym-tracker.js` | `GymTracker` and its session helpers |
| `src/pages/home.js` | `HomePage` landing page and the account menu |
| `src/main.js` | `App` (auth + page switching) and the `createRoot` render |

Everything below describes that code:

- **Root component `App`** switches between three pages: `HomePage` (the landing page, default) with cards linking to `AbsWorkoutTimer` (abs timer) and `GymTracker` (gym log); both pages have a "‹ Home" button in their header back to the landing page.
- **`AbsWorkoutTimer`** holds all timer state. Two orthogonal state machines drive which screen renders:
  - `setupView` (`home` → `preview` → `edit`) controls the setup screens, active only while `phase === "idle"`.
  - `phase` (`idle` → `ready` → `work` ⇄ `rest`/`roundRest` → `done`) says which active-timer screen renders; `THEME` maps each phase to a background/accent color.
- **Timer engine** — the timer is a clock plus a schedule, not a countdown. `start()` calls `buildSchedule()` to flatten the whole workout into `{ segs, starts, total }` (one segment per ready/work/rest/roundRest, zero-length rests dropped, each segment carrying its own `label`/`next` for notification text) and stores it in `scheduleRef`. `clockRef` holds `{ base, at }` — elapsed seconds and the epoch ms they were taken at, `at: null` while paused. `syncFromClock()` (a 200ms `setInterval`, plus `visibilitychange`/`focus`) converts `nowElapsed()` into the current segment via `segmentAt()` and projects it onto `phase`/`round`/`exIndex`/`timeLeft`/`phaseTotal`. Nothing steps phase-by-phase, so a background freeze of any length resolves in one pass. Pause/`skip`/`goBack` all just move `clockRef` and re-sync (`seekTo`).
- **Audio cues** — `buildSchedule` boundaries are queued *ahead* on the Web Audio clock (`scheduleCues` keeps a rolling `CUE_HORIZON`-second window, `cueUntilRef` marking what's already queued), not fired from the tick, so the `3 · 2 · 1 · GO` run is exactly one second apart regardless of render or timer jitter. `CUES` composes each cue from `tone()` notes with an attack/hold/release envelope — the hold is what makes the long `go`/`done` cues read as louder than the short `count` ticks. Anything that changes position (pause, seek, mute, returning to the foreground) must `cancelCues()` and reset `cueUntilRef`, because a suspended context stalls the audio clock and shifts everything queued against it.
- **Background operation** — while running, `startKeepAlive()` plays an inaudible loop (a 30Hz oscillator plus a `±1`-LSB WAV from `getSilentLoopUrl()`); a tab producing audio is exempt from mobile background-timer throttling, and on iOS it keeps the audio session alive. Phase changes while `document.hidden` raise a notification (single `plank-timer` tag, so they replace rather than stack) via `ServiceWorkerRegistration.showNotification` when `sw.js` registered — the only path Android Chrome accepts — falling back to `new Notification`. The wake lock is re-requested on `visibilitychange` since hiding the page drops it.
- **Data model**: `LIBRARY` is the fixed exercise catalog (id, name, duration, cue, desc). Presets (built-in `BUILTIN_PRESETS` plus user-saved ones) store exercise entries that are either a plain id string or `{ id, duration }` when the duration was customized (resolved via `resolveEntry`); the working workout state wraps each entry with a generated `uid` (via `withUids`) so duplicates can be reordered/removed independently.
- **Persistence**: two layers behind the `store` adapter. Local: `window.storage` (Claude artifact storage, when running on claude.ai) falling back to `localStorage`. Cloud: Firestore docs `users/{uid}/data/{key}` shaped `{ value: <JSON string>, updatedAt }`, used automatically when a Google user is signed in (Firebase Auth; compat CDN builds loaded in `<head>`). Writes go local-first then fire-and-forget to Firestore; reads prefer cloud and mirror down locally. On sign-in, local presets merge up once per device+uid (union by preset id, cloud wins; `abs-timer-merged-<uid>` flag, `abs-timer-local-dirty` forces a re-merge for signed-out additions). If `FIREBASE_CONFIG` still has its `PASTE_` placeholders or the SDK fails to load, `firebaseReady` is false and the app degrades to exactly the localStorage-only behavior (account row hidden). Custom presets live under the key `abs-timer-custom-presets`.
- **`GymTracker`** is the gym-log page (`view`: `home` ⇄ `session`). `GYM_EXERCISES` is a fixed ~110-exercise catalog with English + Hebrew names (`name`/`he`), muscle `group`, and optional `alt` aliases; a precomputed normalized `search` haystack per exercise feeds `fuzzyScore` (normalization strips niqqud, folds Hebrew final letters, drops punctuation; matching is per-token exact/prefix/substring/edit-distance≤2/subsequence). Three storage keys, all through the same `store` adapter: `abs-timer-gym-sessions` (history: `{ id, startedAt, endedAt, entries: [{ exId, sets: [{ weight, reps }] }] }`, newest first), `abs-timer-gym-weights` (last weight used per exercise, used for badges and set prefill), and `abs-timer-gym-active` (the in-progress session, so a reload can resume it). While editing, set weight/reps are kept as raw strings and parsed with `parseNum` on finish; active-session writes are debounced 600ms with a flush on `pagehide`/unmount.
- **Drag-to-reorder** in the edit screen uses raw pointer events with fixed row height `ROW_H` for offset math; rows shift visually during the drag and the array reorder is committed once on pointer-up.
- **Styling** is entirely inline via the `styles` object in `src/ui/styles.js` — there is no CSS file or class-based styling. Keys are grouped shared-first, then per page. Dark-navy palette (`#0F1520` background, `#5B8DEF` accent). The one stylesheet rule that can't be inline is the `app-pulse` keyframes for skeletons, which stays in the `<head>`.
- Browser APIs used best-effort (wrapped in try/catch, must not break unsupported browsers): Web Audio for cues, Screen Wake Lock, Notifications, Service Worker.

## Constraints

- **File count is not sacred** — add or split files freely as the code needs it; Netlify (`publish = "."`) and GitHub Pages serve them as-is. Just add the `<script>` tag in `index.html` at the right point in the load order, and add a row to the file map above.
- **No build step, though.** That constraint stays: the site is served straight from the repo root, so everything has to run in the browser unmodified — no bundler, no transpile beyond Babel Standalone, no `import`/`export`.
- Babel Standalone compiles the JSX in-browser, so avoid syntax beyond what `data-presets="react"` handles.
- `sw.js` is purely additive: it exists because Android Chrome will only deliver notifications through a service worker registration, it has no `fetch` handler and caches nothing, and when it isn't served (`file://`) registration just fails and the page falls back to the `Notification` constructor.
