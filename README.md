# Brew Guide

A small React and TypeScript SPA for a single cup of V60 coffee. The current
preview has a responsive shell and hash navigation. Brewing, scale connections,
and native iOS support are not implemented yet.

## Develop and verify

Use Node **24.21.0** (`nvm use`) and npm **11.19.0**. Dependencies are pinned in
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
- `npm run format` — format source and configuration.

Browser tests start and stop their own production preview server and exercise
`/pourover-wizard/`, including direct hash-route reloads. Screenshots and traces
are in `test-results/`; HTML reports are in `playwright-report/`; JUnit reports
are in `reports/`. These generated files are ignored. Failed checks return a
nonzero exit code and retain browser failure evidence. No domain code exists
for coverage or mutation targets yet.

## Structure and boundaries

`src/main.tsx` mounts the app, `app/` composes behavior, and `ui/` renders it.
Add `core/`, `scale/`, and `platform/` only when they have real responsibilities.
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
not publish a website, release, or change repository visibility. Hardware and
SideStore installation require separate real-device verification; browser tests
do not provide that evidence.
