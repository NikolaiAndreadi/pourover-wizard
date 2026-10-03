# Brew Guide

A small React and TypeScript SPA for a single cup of V60 coffee. The current
preview guides a complete brew with a timer or a deterministic simulated scale.
Learn mode rehearses the same timeline at 1× or 4×. Real Bluetooth brewing and
native iOS support still require separate implementation and device acceptance.

## Develop and verify

Use Node **26.10.0** (`nvm use`) and npm **12.2.0**. Track the latest stable
Node Current release, including non-LTS releases, and compatible npm. Dependencies are pinned in
`package.json` and `package-lock.json`; install with `npm ci`. Install the test
browser once with `npx playwright install chromium` (Linux CI also uses
`--with-deps`). Then:

- `npm run dev` — open the local app at `/pourover-wizard/`.
- `npm run check:fast` — strict type checking, Biome, dependency boundaries,
  Bluetooth API restriction, and unit tests.
- `npm run test:watch` — unit tests while editing.
- `npm run test:e2e` — build and test production assets with Playwright.
- `npm run check` — fast checks alongside the production browser checks. Fast
  checks run two tasks at a time; Vitest uses up to two workers and Playwright
  uses one.
- `npm run test:coverage` — scoped core/BOOKOO codec coverage, including untouched
  files, in `reports/coverage/` (HTML, coverage-final.json, and coverage-summary.json).
- `npm run report:complexity` — classic cyclomatic complexity in
  `reports/complexity.json`; no CRAP score or hard gate.
- `npm run quality:report` — coverage followed by complexity reporting.
- `npm run test:mutation` — targeted engine/recipe-function/BOOKOO codec mutations
  with an incremental cache in `reports/mutation/incremental.json` and two workers.
- `npm run test:mutation:full` — fresh mutation evidence after dependency,
  configuration, or fixture changes and before releases; results in
  `reports/mutation/index.html` and `reports/mutation/mutation.json`.
- `npm run format` — format source and configuration.

Vitest and its coverage package are pinned together at **4.1.11** for reliable
Stryker 10 test selection. [Upstream issue #6210](https://github.com/stryker-mutator/stryker-js/issues/6210)
tracks Vitest 5 nested suite name separators causing Stryker's per-test filters
to skip those tests. Upgrading this pair requires a known-mutant canary proving the relevant nested tests run, followed by a fresh
full mutation run and the normal checks.

TypeScript **6.0.3** supplies the classic compiler API used by the syntax-aware
guards and dependency checks. [TypeScript 7.0 ships without that API](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/),
but supports running its native checker alongside the classic API package.
The [typescript-eslint compatibility range](https://typescript-eslint.io/users/dependency-versions/#typescript)
also requires the classic API below 6.1. This repository keeps 6.0.3 for its
checks until that migration is verified. Node declarations use **26.6.4**,
matching the required Node 26 runtime.

Browser tests start and stop their own production preview server and exercise
`/pourover-wizard/`, including direct hash-route reloads. Screenshots and traces
are in `test-results/`; HTML reports are in `playwright-report/`; JUnit reports
are in `reports/`. These generated files are ignored. Failed checks return a
nonzero exit code and retain browser failure evidence. Pure recipe and engine
behavior tests cover dose limits, time boundaries, delayed frames, explicit arming, start races, deliberate cancellation, and bounded
simulation charts. Browser journeys use an injected browser clock rather than
waiting for a real three-minute brew.

## Structure and boundaries

`src/main.tsx` mounts the app, `core/` defines the pure recipe and session engine,
`scale/fake.ts` supplies seeded synthetic readings, `app/` composes the clock and
session, and `ui/` renders preparation, brewing, and summary.
Core modules have no application dependencies and compile without DOM types.
Scale and platform modules may use core; app may compose them; UI may use app
and type-only core imports. Dependency-cruiser resolves TypeScript aliases,
dynamic imports, and re-exports, and rejects cycles. Bluetooth APIs and native
Bluetooth imports belong only in `scale/transport/`; the syntax-aware guard
also checks computed access and destructuring. Deliberately obfuscated or
runtime-generated API access is outside this static check; keep such patterns
out of application code.

CI runs on main pushes, pull requests, and manual dispatch with read-only token
permissions. It uploads short-lived private build and test artifacts and does
not publish a website, release, or change repository visibility. Quality reports
run in regular CI; mutation is an optional manual workflow input. Hardware and
SideStore installation require separate real-device verification; browser tests
do not provide that evidence.

## Brewing behavior and recipe source

Tap **Pour now** to start at the tap time. In simulated mode, first tare, then
explicitly **Arm auto-start**, then **Simulate a pour**. Tare and entering the
screen never arm or start a brew. Automatic detection needs fresh consecutive
weight rises over at least half a second, totaling at least 3 g; the accepted
start is backdated to that rise's baseline. The first accepted manual or detected
start wins. These detection thresholds are simulation behavior and have not been
validated against physical scale recordings.

Hold the cancel button, Space, or Enter for three physical seconds. Early
release, pointer cancellation, lost focus, or page hiding resets the hold. This
threshold stays three seconds during accelerated Learn playback. Cancellation
clears the session and requires a fresh preparation. Once drawdown starts, tap
**Done** when the coffee has drained; weight under a dripper and server cannot
measure drawdown. Leaving Home for About preserves the in-memory brew; reloading
the page clears it. No brew history is persisted.

James Hoffmann's [A Better 1 Cup V60 Technique](https://www.youtube.com/watch?v=1oB1oDrDkHM)
uses 15 g coffee and 250 g water. The original video's on-screen timing table
(at [4:46](https://www.youtube.com/watch?v=1oB1oDrDkHM&t=286s)) was directly checked,
with the original video's automatic captions and [Hario's recipe reference](https://www.hario-usa.com/blogs/recipes-and-more-from-friends/james-hoffmann-1-cup-v60-technique)
as corroboration. The guide follows the bloom, two gentle swirls, and four later
pulse pours, reaching 250 g at 2:00 and starting drawdown after the final swirl
at 2:05. Around 3:00 is guidance; completion is manual. Linear interpolation
between pour boundaries, including the initial 0:00–0:10 ramp, is our expected
curve approximation, not a measured curve or a required constant flow.

Doses from 10–25 g scale the water ratio precisely and retain the original timing.
Only the original 15 g recipe was verified; scaled brewing results have not been
tested. Timer summaries show targets and elapsed time without inventing measured
water, ratio, or chart data. Fake/Learn summaries label synthetic readings and
ratios explicitly. Their final poured amount retains the highest settled reading
from a window spanning at least 500 ms (readings within 1 g), ignoring brief spikes
and subsequent dripper removal. Sustained load disturbances may still inflate it;
this approximation needs physical-device evaluation before real-scale use.

Display samples use brew-relative timestamps and are bounded to 600 points by
thinning older points while preserving the start and latest point. They are a
chart, not a raw hardware recording. The simulation seed is fixed for reproducible
rehearsals. No real-device, iOS, or SideStore behavior has been verified here.

The [Scale lab](docs/bookoo-lab.md) is a separate diagnostic route at
`#/scale-lab`, with raw capture and replay. It does not connect scale notifications
to the brew guide. Protocol interpretation and hardware acceptance remain explicit
lab gates; synthetic replay is not a physical-device result.
