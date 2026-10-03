# Brew Guide

A small React and TypeScript V60 brewing SPA with a guided timer, deterministic
simulated scale, and Learn playback at 1× or 4×. The separate BOOKOO lab supports
raw capture and replay; live-scale brewing and native iOS remain unfinished.

## Develop and verify

Use Node **26.10.0** (`nvm use`) and npm **12.2.0**. Install locked dependencies
with `npm ci`, then `npx playwright install chromium` (Linux CI adds `--with-deps`).
Track the latest stable Node Current and latest compatible npm when updating
the runtime.

| Command | Purpose / output |
| --- | --- |
| `npm run dev` | Local app at `/pourover-wizard/` |
| `npm run check:fast` | Type checks, Biome, dependency/Bluetooth boundaries, unit tests |
| `npm run test:watch` | Unit tests while editing |
| `npm run test:e2e` | Build and test production assets with Playwright |
| `npm run check` | Fast checks and production browser checks |
| `npm run test:coverage` | Core/BOOKOO codec coverage, including untouched files; `reports/coverage/` |
| `npm run report:complexity` | Cyclomatic complexity; `reports/complexity.json` |
| `npm run quality:report` | Coverage then complexity; no metric gate or CRAP score |
| `npm run test:mutation` | Engine, recipe functions, BOOKOO codec; incremental cache in `reports/mutation/incremental.json` |
| `npm run test:mutation:full` | Fresh mutation run; `reports/mutation/index.html` and `mutation.json` |
| `npm run format` | Format source and configuration |

Run fresh mutation checks after dependency, configuration, or fixture changes
and before releases; review survivors rather than treating a score as proof.
Checks run at most two tasks concurrently; Vitest uses two workers, Playwright
one, and mutation four. On smaller hosts, use
`npm run test:mutation:full -- --concurrency 2`.

Browser tests own their preview server and exercise `/pourover-wizard/`, including
hash-route reloads, using an injected clock. Stop any existing preview on port
4173 first. Failure screenshots/traces are in `test-results/`, HTML reports in
`playwright-report/`, and JUnit reports in `reports/`. Generated outputs are ignored.

### Toolchain compatibility

Vitest and coverage stay paired at **4.1.11** because
[Stryker issue #6210](https://github.com/stryker-mutator/stryker-js/issues/6210)
affects Vitest 5 nested-test filtering. Before upgrading, prove nested tests run
with known checksum/cancellation mutants, then run fresh mutation and normal checks.

TypeScript **7.0.2** checks app and DOM-free core through `tsc`.
[Supported side-by-side aliases](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-60)
keep `@typescript/native` on the native compiler and `typescript` on the classic
compatibility package: package **6.0.2**, locked compiler API **6.0.3**, CLI `tsc6`.
The guards, dependency checker, complexity parser, and Stryker use that classic
API; the parser requires TypeScript below 6.1. Retain the classic core check.
After changes, verify `npm exec -- tsc --version`, `npm exec -- tsc6 --version`,
and the version and `createSourceFile` export from `import ts from "typescript"`.

## Architecture and delivery

`core/` owns pure recipe/session logic without DOM types. `scale/` owns fake,
codec, recording/replay, and transport modules. `app/` composes adapters; `ui/`
uses app and type-only core imports. Dependency checks reject cycles and invalid
layer imports; Bluetooth APIs and native imports belong in `scale/transport/`.

CI checks main pushes, pull requests, and manual dispatch with read-only token
permissions. It retains build/test artifacts for seven days, reports coverage
and complexity, and optionally runs fresh mutation. Publication and repository
visibility changes require separate authorization.

## Brewing behavior and source

**Pour now** starts at tap time. In simulation, tare, explicitly **Arm auto-start**,
then **Simulate a pour**. Tare and opening the screen never arm or start a brew.
Detection requires fresh consecutive rises totaling at least 3 g over at least
500 ms and backdates start to the rise baseline. The first manual or detected
start wins. These thresholds need validation against physical recordings.

Hold cancel, Space, or Enter for three physical seconds, including in accelerated
Learn mode. Early release, pointer cancellation, lost focus, or page hiding resets
the hold. Cancellation clears the session; **Done** manually ends drawdown.
About navigation preserves the in-memory brew; reload clears it. No history is saved.

James Hoffmann's [A Better 1 Cup V60 Technique](https://www.youtube.com/watch?v=1oB1oDrDkHM)
uses 15 g coffee and 250 g water. Timing was checked against the original video's
[4:46 table](https://www.youtube.com/watch?v=1oB1oDrDkHM&t=286s), with captions and
[Hario's reference](https://www.hario-usa.com/blogs/recipes-and-more-from-friends/james-hoffmann-1-cup-v60-technique)
corroborating. The guide reaches 250 g at 2:00 and starts drawdown after the final
swirl at 2:05; around 3:00 is guidance. Linear pour ramps are modeled approximations.
Doses of 10–25 g scale water while retaining timing; only the original recipe
was source-verified, and scaled brewing results remain untested.

Timer summaries show targets without fabricated measurements. Fake/Learn data
is labeled synthetic. Final simulated weight uses the highest settled reading
(at least 500 ms within 1 g), excluding brief spikes and dripper removal;
sustained load disturbances may inflate it. Charts retain at most 600 display
samples and are not raw recordings.

See the [BOOKOO lab guide](docs/bookoo-lab.md) for `#/scale-lab`, protocol limits,
capture/replay, and the hardware checklist. No real-device, iOS, or SideStore
behavior has been accepted; browser mocks do not provide that evidence.
