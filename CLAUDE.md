# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A single-page, scroll-driven 3D explainer ("How it's done · Doggett Group") that follows one A4 sheet through a production digital press (feeder → registration → 5-station tandem engine → fuser → duplex inverter → second side → cooling/decurl/sensor → finisher). Plain static HTML/CSS/ES modules — no build step, no package.json, no tests, no linter.

Dependencies load from jsDelivr via the import map in `index.html`: `three@0.180.0` (plus `three/addons/` for postprocessing and `BufferGeometryUtils`) and `animejs@4.5.0`.

## Running

Serve the directory over HTTP (ES modules + import map won't work from `file://`). `.claude/launch.json` defines a `press` config: `python -m http.server 5173` → http://localhost:5173. Use `preview_start {name: "press"}` to open it.

## Architecture

- **`js/main.js`** — everything runtime: renderer + composer (bloom, only enabled in dark theme), timeline, chapters, sheet/ribbon/trail geometry, camera, HUD readout, SVG callout labels, minimap, theme + solid toggles, and the `frame()` loop. It uses top-level `await` (fonts) before building textures.
- **`js/machine.js`** — builds the wireframe press model with `createPress(scene, pal)`, returning handles (`P0/P1/P2` paths, `belt`, `doors`, `rotors`, `lasers`, `diverter`, …) plus `setTheme(pal)` and `setSolid(k)`. Also exports geometry constants (`L`, `W`, `PAPER_Y`, `STATIONS`, `MODULES`, `FEED_DY`, …). Units: **1 = 100 mm**; X = feed→delivery length, Y = up, Z = depth (+ = front).
- **`js/path.js`** — 2D (XY plane) `PathBuilder` (turtle-style `toX/toY/arc/line`, with named `.mark('name')` positions), `Polyline` (arc-length `sample`, `nearest`), and `beltLoop` for the intermediate transfer belt.
- **`js/textures.js`** — procedural canvas "press test form" artwork for sides A/B plus the pink-station mask.
- **`js/theme.js`** — `PALETTES.light` / `PALETTES.dark` for all WebGL/SVG colours, and localStorage helpers (`dg-theme`, `dg-solid`). Page-chrome colours are separate CSS tokens in `styles.css`; keep the two in sync when changing theme colours. Brand: Doggett blue `#0074C8`, grey `#797774`.

### Scroll → state pipeline

1. `#track` (height set in `styles.css`) provides the scroll length; `scrollT()` maps scroll to 0–1 and `tView` eases toward it each frame.
2. The first `INTRO` (0.1) of scroll is the door-opening reveal (`updateReveal`); the rest is remapped to story time `t ∈ [0,1]`.
3. `computeState(t)` derives everything from keyframe tables:
   - `DKEYS` — distance `D` of the sheet's leading edge along P1 then P2 (P2 offset by `off2 = P1.total - L`). Keyframes are anchored to path marks (`reg`, `nip`, `fuser`, `div`, `sensor`, …), so editing a path in `buildPaths()` automatically shifts the choreography.
   - `SKEWKEYS` — registration skew correction.
   - `beltTravel` — belt keeps moving while the sheet waits at registration (`T_IMG0`–`T_REL`) so the image builds, then locks to the sheet.
4. `CH` chapters (with `t0` start times) drive the panel text, rail, and camera; chapter `t0`s must line up with the `DKEYS` segments they describe.
5. Each `update*` function in `frame()` consumes that state object — keep per-frame logic stateless w.r.t. scroll direction so scrubbing backwards works.

Adding a new moving part generally means: build it in `createPress` and return a handle, colour it in `setTheme` (and add palette keys to both themes), then animate it from `updateMechanics` in `main.js`.
