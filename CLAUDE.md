# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A mobile-first abs workout timer, deployed as a static site (GitHub Pages, per the git history's CNAME commits). The entire app lives in a single file: `index.html`. There is no build step, no package.json, no linter, and no tests.

## Running it

Open `index.html` directly in a browser, or serve the directory with any static server (e.g. `python -m http.server`). Changes take effect on reload.

## Architecture

`index.html` loads React 18, ReactDOM, and Babel Standalone from cdnjs, then defines the whole app as JSX inside a `<script type="text/babel">` block, compiled in the browser at runtime. Everything below applies to that one script block:

- **One root component, `AbsWorkoutTimer`**, holding all state. Two orthogonal state machines drive which screen renders:
  - `setupView` (`home` → `preview` → `edit`) controls the setup screens, active only while `phase === "idle"`.
  - `phase` (`idle` → `ready` → `work` ⇄ `rest`/`roundRest` → `done`) is the workout state machine. Transitions live in `advance()`, triggered when the 1-second `setInterval` tick drives `timeLeft` to 0. `THEME` maps each phase to a background/accent color for the active-timer screen.
- **Data model**: `LIBRARY` is the fixed exercise catalog (id, name, duration, cue). Presets (built-in `BUILTIN_PRESETS` plus user-saved ones) store exercise *ids*; the working workout state wraps each id with a generated `uid` (via `withUids`) so duplicates can be reordered/removed independently.
- **Persistence**: the `store` adapter prefers `window.storage` (Claude artifact storage, when running on claude.ai) and falls back to `localStorage` for standalone hosting. Custom presets are saved under the key `abs-timer-custom-presets`.
- **Drag-to-reorder** in the edit screen uses raw pointer events with fixed row height `ROW_H` for offset math; rows shift visually during the drag and the array reorder is committed once on pointer-up.
- **Styling** is entirely inline via the `styles` object at the bottom of the script — there is no CSS file or class-based styling. Dark-navy palette (`#0F1520` background, `#5B8DEF` accent).
- Browser APIs used best-effort (wrapped in try/catch, must not break unsupported browsers): Web Audio for beeps, Screen Wake Lock while the timer runs.

## Constraints

- Keep everything in `index.html` — the single-file, no-build setup is intentional so the app works as a GitHub Pages page and as a Claude artifact export.
- Babel Standalone compiles the JSX in-browser, so avoid syntax beyond what `data-presets="react"` handles.
