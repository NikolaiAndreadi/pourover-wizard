# Pourover Wizard

A small React and TypeScript V60 brewing SPA with a guided timer and step-by-step
recipe preview. Live BOOKOO brewing uses a built-in Mini encoding confirmed at
zero and ±12.2 g; the iOS shell uses native BLE. Full physical brewing and
SideStore acceptance remain pending.

## Develop and verify

Use Node **26.10.0** (`nvm use`) and npm **12.2.0**. Install locked dependencies
with `npm ci`, then `npx playwright install chromium` (Linux CI adds `--with-deps`).
Track the latest stable Node Current and latest compatible npm when updating
the runtime.

| Command                      | Purpose / output                                                                                |
|------------------------------|-------------------------------------------------------------------------------------------------|
| `npm run dev`                | Local app at `/pourover-wizard/`                                                                |
| `npm run check:fast`         | Type checks, Biome, dependency/Bluetooth boundaries, unit tests                                 |
| `npm run test:watch`         | Unit tests while editing                                                                        |
| `npm run test:e2e`           | Build and test production assets with Playwright                                                |
| `npm run check`              | Fast checks and production browser checks                                                       |
| `npm run test:coverage`      | Core/BOOKOO codec coverage, including untouched files; `reports/coverage/`                      |
| `npm run report:complexity`  | Cyclomatic complexity; `reports/complexity.json`                                                |
| `npm run quality:report`     | Coverage then complexity; no metric gate or CRAP score                                          |
| `npm run test:mutation`      | Core session modules, recipe functions, BOOKOO codec; cache `reports/mutation/incremental.json` |
| `npm run test:mutation:full` | Fresh mutation run; `reports/mutation/index.html` and `mutation.json`                           |
| `npm run format`             | Format source and configuration                                                                 |
| `npm run ios:sync`           | Build native web assets and sync the iOS SPM project                                            |
| `npm run ios:package`        | Unsigned device IPA and SHA-256 in `reports/ios/`; requires macOS/Xcode                         |

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

`core/` owns pure recipe/session logic without DOM types. `scale/` owns the
BOOKOO codec and transport modules. `platform/` holds browser storage adapters,
such as the remembered scale, and depends only on core and itself. `app/` composes adapters; `ui/`
uses app and type-only core imports. Dependency checks reject cycles and invalid
layer imports; Bluetooth APIs and native imports belong in `scale/transport/`.

CI checks main pushes, pull requests, and manual dispatch with read-only token
permissions. It retains build/test artifacts for seven days, reports coverage
and complexity, and optionally runs fresh mutation. Publication and repository
visibility changes require separate authorization.

## Brewing behavior and source

**Pour now** starts at tap time in every mode, including live brewing without a
connected scale. Choose BOOKOO live scale, prepare the brew, and connect. The built-in
Mini profile handles signed grams without setup codes or a confirmation checkbox.
Connect, explicitly tare, wait for at least 500 ms of fresh stable readings within
1 g of zero, then explicitly tap **Start when I pour** if desired. A completed tare write
is not proof that the hardware tared; zero readings are also required. Tare never
arms. Readings older than 500 ms clear readiness and detection; the timer continues
while waiting for fresh readings. An actual Bluetooth disconnect stops a live
brew immediately, preserves its elapsed time and chart, and shows
**scales disconnected!**. If armed, disconnect disarms instead. Reconnect and
tare again before arming a new brew.
No automatic tare or scale timer synchronization occurs. Live weight display uses
a short median; detection and settled estimation use unsmoothed decoded readings.
Completion, cancellation, interruption, restart and app teardown release the
live connection.

The device chooser lists only BOOKOO scales: on the web, devices advertising the
BOOKOO service or a name beginning with `BOOKOO_SC`; on iOS, names beginning with
`BOOKOO_SC`, because the native plugin combines criteria with AND and service
advertising is unverified. The prefix (`BOOKOO_SC`, a space, then a
device-specific suffix) was observed on the user's Themis Mini in Chrome's
chooser; the vendor's Mini protocol does not document advertising. After a
successful pick the app remembers the scale's id and name in local storage
(blocked storage only means the chooser opens each time). The next **Connect
scale** first tries that scale without the chooser, showing **Connecting to**
its name: on iOS by retrieving the peripheral by id with a 5 s connection
bound, and on the web only where `navigator.bluetooth.getDevices()` exists, by
waiting up to 4 s for an advertisement and then connecting with a 10 s bound.
Chrome currently exposes `getDevices()` and `watchAdvertisements()` only behind
`chrome://flags/#enable-experimental-web-platform-features`, so stable Chrome
shows the filtered chooser on every connection. If the remembered scale cannot
be reached, the filtered chooser opens and a new pick replaces the remembered
scale; if the browser refuses the chooser because the tap has expired, the next
tap opens it directly. **Forget scale** in About's "How the guide works"
section clears the remembered scale. Filtering, remembering and reconnecting
are covered only by mocked radios; real-device behavior on Chrome and iOS
is unverified.

**Get ready** opens the ready screen: in live mode **Tare** first, then **Pour
now**, one short instruction, **Start when I pour** in live mode, and a
secondary recipe preview. Use the previous/next buttons or
Left/Right arrow keys to preview the recipe. Previewing a later stage hides start
and arm controls; **Go to start** or returning to the first stage restores them.
Previewing never starts a timer or produces scale measurements.

While brewing, the screen shows the step headline (pours name their scaled
target, such as "Pour to 100 g"), a pixel-art scene of the current action, time
left in the step (the largest number during swirls and waits), Now and Next step
cards (the Next card shows a still frame of its scene), the recipe progress, and
the compact progress strip. The elapsed timer stays small in the top corner.
During a session, **Hold to cancel** and, in live mode, the one-line scale status
with **Connect scale**/**Disconnect scale** sit in the page header; **Tare** and
**Start when I pour** stay on the ready screen. Both modes brew with a compact
progress strip showing the recipe shape, step boundaries, swirl bands and the
current guidance position. In live mode, each pour step adds a taller panel
beneath the strip that zooms into that pour's time and gram range: the ideal
ramp is dashed, measured weight is solid, and a dot marks the newest fresh
reading; readings inside swirl intervals are not drawn. The summary and the
stopped-brew screen show the full chart. Scenes are inline SVG frames; reduced motion shows
a single still frame. Explanations of the guide's limits live in the About
page's "How the guide works" section rather than on the brewing screen.

Tare and opening the screen never arm or start a brew. Detection requires fresh
consecutive rises totaling at least 3 g over at least 500 ms and backdates start
to the rise baseline. The first manual or detected start wins. These thresholds
need validation with the physical scale.

Hold **Hold to cancel**, Space, or Enter for one physical second. Early release,
pointer cancellation, lost focus, or page hiding resets the hold. Cancellation
clears the session. **Done** appears only once drawdown starts and manually ends
the brew.
About navigation preserves the in-memory brew; reload clears it. No history is saved.

James Hoffmann's [A Better 1 Cup V60 Technique](https://www.youtube.com/watch?v=1oB1oDrDkHM)
uses 15 g coffee and 250 g water. Timing was checked against the original video's
[4:46 table](https://www.youtube.com/watch?v=1oB1oDrDkHM&t=286s), with captions and
[Hario's reference](https://www.hario-usa.com/blogs/recipes-and-more-from-friends/james-hoffmann-1-cup-v60-technique)
corroborating. The guide reaches 250 g at 2:00 and starts drawdown after the final
swirl at 2:05; around 3:00 is guidance. Linear pour ramps are modeled approximations.
Doses of 10–25 g scale water while retaining timing; only the original recipe
was source-verified, and scaled brewing results remain untested.

Timer summaries show targets without fabricated measurements. Live summaries show
**Water poured**, an estimate from the highest settled reading (at least 500 ms within 1 g), excluding brief spikes and
dripper removal; sustained load disturbances may inflate it. Live water/ratio
estimates require a verified tared stable zero baseline at manual start or
explicit arming; starting without that baseline still provides the timer and
measured chart, but no net poured-water estimate. A stopped brew retains its
original baseline and measurements. Live summaries identify missing readings
and show an estimated ratio
only when a settled measurement exists. Charts split across lost readings,
retain at most 600 display samples, and are not raw recordings. The full chart
shows gram/time ticks, a grid, amber guidance and teal scale weight, plus
moving progress dots; the timer-mode strip has its own moving guidance dot. The complete recommendation stays
visible alongside animated now/next step cards; reduced motion turns
off transitions. Purple bands mark the prescribed swirl intervals (0:10–0:15 and
2:00–2:05). Movement readings are hidden from the actual trace and chart scale in
those intervals, with no line bridging them; the purple dashed plateau is guidance,
not a measurement. Session samples remain unchanged. Negative display/chart readings are clamped to zero without changing raw samples;
above-target readings outside swirl intervals expand the chart scale; extended drawdown expands
the time axis. Swirling outside the prescribed intervals is not detected.

The vendor's [Mini protocol](https://github.com/BooKooCode/OpenSource/blob/6e3f48a81aa7b209871517cf7cda19399d8a16ba/bookoo_mini_scale/protocols.md)
defines the BOOKOO service, notifications, command characteristic, weight fields,
and XOR checksum. The built-in gram/sign mapping was confirmed using physical
Mini notifications at zero and ±12.2 g. Exact packets are retained in
[`hardware.fixture.ts`](src/scale/bookoo/hardware.fixture.ts). No supplied packet
encodes -12.3 g, though that value was observed on the display. Other units and
unknown sign codes are not converted. The app uses monotonic receipt times for
samples rather than the scale timer, and only sends explicit tare commands.
Successful writes alone do not establish that the scale executed a command.

Tare execution, full brews, disconnect/reconnect behavior, native iOS, and
SideStore acceptance still require physical verification. Compare displayed
weight and brew behavior on the actual hardware; browser mocks do not provide
that evidence.
See the [iOS and SideStore guide](docs/ios.md) for the native build, private IPA
workflow, phone import, foreground limits, and pending acceptance checks.

The Capacitor CLI uses `xcode`, whose CommonJS `uuid.v4()` call remains compatible
with the narrowly overridden `uuid` **11.1.1**. This avoids the older uuid
[buffer bounds advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq); native
sync and archive validate the CLI dependency path.

## Offline web app and updates

The production web build includes an installable PWA manifest and a service
worker scoped to `/pourover-wizard/`. Open it online once and wait for
**Available offline** before relying on it without internet. The complete app
and recipe are cached; a later offline launch or hash-route reload works without
a network connection. Installation is optional. HTTPS is required except on
localhost. Browser storage clearing or eviction removes the offline copy.

The app checks for updates when opened, when internet returns, and when brought
back to the foreground. A complete new version downloads in the background;
failed downloads leave the current version usable. **Update ready** means the
next version is cached. Finish brewing, then close **all** tabs and installed
app windows and reopen to activate it. Reloading a still-open tab does not force
an update. Updates never automatically reload a brew, an armed session, or its
summary; a manually closed session still loses its in-memory data.

The iOS/SideStore bundle already contains its web assets and does not register
or emit the web service worker or manifest. Native updates use a replacement
IPA. Chromium production tests cover offline reload and waiting-worker updates;
installed iOS/Safari offline behavior and physical BLE use remain unverified.
