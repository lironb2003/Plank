# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A mobile-first abs workout timer, deployed as a static site (GitHub Pages, per the git history's CNAME commits). The entire app lives in a single file: `index.html`. There is no build step, no package.json, no linter, and no tests.

## Running it

Open `index.html` directly in a browser, or serve the directory with any static server (e.g. `python -m http.server`). Changes take effect on reload.

## Architecture

`index.html` loads React 18, ReactDOM, and Babel Standalone from cdnjs, then defines the whole app as JSX inside a `<script type="text/babel">` block, compiled in the browser at runtime. Everything below applies to that one script block:

- **Root component `App`** switches between the two pages: `AbsWorkoutTimer` (the timer, default) and `GymTracker` (gym log), linked from the timer's home screen via the "Gym Log" card.
- **`AbsWorkoutTimer`** holds all timer state. Two orthogonal state machines drive which screen renders:
  - `setupView` (`home` → `preview` → `edit`) controls the setup screens, active only while `phase === "idle"`.
  - `phase` (`idle` → `ready` → `work` ⇄ `rest`/`roundRest` → `done`) is the workout state machine. Transitions live in `advance()`, triggered when the 1-second `setInterval` tick drives `timeLeft` to 0. `THEME` maps each phase to a background/accent color for the active-timer screen.
- **Data model**: `LIBRARY` is the fixed exercise catalog (id, name, duration, cue, desc). Presets (built-in `BUILTIN_PRESETS` plus user-saved ones) store exercise entries that are either a plain id string or `{ id, duration }` when the duration was customized (resolved via `resolveEntry`); the working workout state wraps each entry with a generated `uid` (via `withUids`) so duplicates can be reordered/removed independently.
- **Persistence**: two layers behind the `store` adapter. Local: `window.storage` (Claude artifact storage, when running on claude.ai) falling back to `localStorage`. Cloud: Firestore docs `users/{uid}/data/{key}` shaped `{ value: <JSON string>, updatedAt }`, used automatically when a Google user is signed in (Firebase Auth; compat CDN builds loaded in `<head>`). Writes go local-first then fire-and-forget to Firestore; reads prefer cloud and mirror down locally. On sign-in, local presets merge up once per device+uid (union by preset id, cloud wins; `abs-timer-merged-<uid>` flag, `abs-timer-local-dirty` forces a re-merge for signed-out additions). If `FIREBASE_CONFIG` still has its `PASTE_` placeholders or the SDK fails to load, `firebaseReady` is false and the app degrades to exactly the localStorage-only behavior (account row hidden). Custom presets live under the key `abs-timer-custom-presets`.
- **`GymTracker`** is the gym-log page (`view`: `home` ⇄ `session`). `GYM_EXERCISES` is a fixed ~110-exercise catalog with English + Hebrew names (`name`/`he`), muscle `group`, and optional `alt` aliases; a precomputed normalized `search` haystack per exercise feeds `fuzzyScore` (normalization strips niqqud, folds Hebrew final letters, drops punctuation; matching is per-token exact/prefix/substring/edit-distance≤2/subsequence). Three storage keys, all through the same `store` adapter: `abs-timer-gym-sessions` (history: `{ id, startedAt, endedAt, entries: [{ exId, sets: [{ weight, reps }] }] }`, newest first), `abs-timer-gym-weights` (last weight used per exercise, used for badges and set prefill), and `abs-timer-gym-active` (the in-progress session, so a reload can resume it). While editing, set weight/reps are kept as raw strings and parsed with `parseNum` on finish; active-session writes are debounced 600ms with a flush on `pagehide`/unmount.
- **Drag-to-reorder** in the edit screen uses raw pointer events with fixed row height `ROW_H` for offset math; rows shift visually during the drag and the array reorder is committed once on pointer-up.
- **Styling** is entirely inline via the `styles` object at the bottom of the script — there is no CSS file or class-based styling. Dark-navy palette (`#0F1520` background, `#5B8DEF` accent).
- Browser APIs used best-effort (wrapped in try/catch, must not break unsupported browsers): Web Audio for beeps, Screen Wake Lock while the timer runs.

## Constraints

- Keep everything in `index.html` — the single-file, no-build setup is intentional so the app works as a GitHub Pages page and as a Claude artifact export.
- Babel Standalone compiles the JSX in-browser, so avoid syntax beyond what `data-presets="react"` handles.
