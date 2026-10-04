# Pourover Wizard

A small React and TypeScript V60 brewing SPA with a guided timer, a choice of
time-locked recipes with in-app author credits, and a step-by-step recipe
preview. Live BOOKOO brewing uses a built-in Mini encoding confirmed at zero and
±12.2 g; the iOS shell uses native BLE. Full physical brewing and SideStore
acceptance remain pending.

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
| `npm run check`              | Fast checks, production browser checks, and the coverage, complexity and CRAP report            |
| `npm run test:coverage`      | Core/BOOKOO codec coverage, including untouched files; `reports/coverage/`                      |
| `npm run report:complexity`  | Cyclomatic complexity; `reports/complexity.json`                                                |
| `npm run quality:report`     | Coverage, complexity, then the CRAP gate                                                        |
| `npm run report:crap`        | CRAP gate from the two reports above; `reports/crap.json`                                       |
| `npm run test:mutation`      | Core session modules, recipe functions, BOOKOO codec; cache `reports/mutation/incremental.json` |
| `npm run test:mutation:full` | Fresh mutation run; `reports/mutation/index.html` and `mutation.json`                           |
| `npm run format`             | Format source and configuration                                                                 |
| `npm run ios:sync`           | Build native web assets and sync the iOS SPM project                                            |
| `npm run ios:package`        | Unsigned device IPA and SHA-256 in `reports/ios/`; requires macOS/Xcode                         |

Run fresh mutation checks after dependency, configuration, or fixture changes
and before releases; review survivors rather than treating a score as proof.
Checks run at most two tasks concurrently; the coverage run writes its JUnit
result to `reports/unit-coverage.xml` so it never overwrites `reports/unit.xml`.
Vitest uses two workers, Playwright one, and mutation four. On smaller hosts, use
`npm run test:mutation:full -- --concurrency 2`.

Browser tests own their preview server and exercise `/pourover-wizard/`, including
a reload of the hash URL, using an injected clock. Stop any existing preview on port
4173 first. Failure screenshots/traces are in `test-results/`, HTML reports in
`playwright-report/`, and JUnit reports in `reports/`. Generated outputs are ignored.

### CRAP gate

`npm run report:crap` scores every function that unit coverage measures, that
is `src/core/**/*.ts` and `src/scale/bookoo/codec.ts` without tests, with
CRAP = complexity² × (1 − coverage)³ + complexity, where coverage is the
fraction of the function's own statements the unit tests executed. Any function
above **30**, the classic CRAP threshold, fails the check. UI, app hooks,
transport and platform adapters are out of scope because Playwright and mocked
radios exercise them, not unit coverage, and mutation results stay ungated. Fix
a failure with behavior tests or by simplifying the function; do not raise the
threshold. `reports/crap.json` lists every scored function in descending order
with any join warnings.

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

`core/` owns pure recipe/session logic without DOM types: `recipe.ts` holds
the recipe type and its pure functions, `recipes.ts` the recipe data. Mutation
checks cover `recipe.ts` whole and leave the source-verified data in
`recipes.ts` alone. `scale/` owns the
supported-scale registry, the BOOKOO codec and the transport modules. `platform/` holds browser storage adapters,
such as the remembered scale, and depends only on core and itself. `app/` composes adapters; `ui/`
uses app and type-only core imports. Dependency checks reject cycles and invalid
layer imports; Bluetooth APIs and native imports belong in `scale/transport/`.

CI checks main pushes, pull requests, and manual dispatch with read-only token
permissions. It retains build/test artifacts for seven days, reports coverage,
complexity, and the CRAP gate, and optionally runs fresh mutation. Publication and repository
visibility changes require separate authorization.

## Brewing behavior and source

**Start now** starts at tap time in every mode. There is no mode switch: a
prepared brew is timer only until a scale connects from the header, which turns
it into scale assist, and disconnecting before the start turns it back. The
built-in Mini profile handles signed grams without setup codes or a
confirmation checkbox.
Connect, explicitly tare, wait for at least 500 ms of fresh stable readings within
1 g of zero, then explicitly tap **Auto start on weight change** if desired. A completed tare write
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

Supported scales are data in [`supported.ts`](src/scale/supported.ts): each
entry names the brand and model, its advertised name prefixes, the service,
notification and command UUIDs, the protocol that selects the codec, and
whether it is `verified`, with a note separating what was observed from what
is only documented. The BOOKOO Themis Mini is verified: the `BOOKOO_SC` name
prefix was observed in Chrome's chooser, and its service and characteristics
and the gram/sign decoding were confirmed on the physical scale. The BOOKOO
Ultra Scale is documented only, from the vendor's
[Ultra protocol](https://github.com/BooKooCode/OpenSource/blob/6e3f48a81aa7b209871517cf7cda19399d8a16ba/bookoo_ultra_scale/protocols.md):
it lists the same service, characteristics, weight frame, tare command and
checksum as the Mini, documents no advertised name, and has not been tested.
Because the two share a service, a connected device is reported as the Mini
when its name matches the Mini's prefix and otherwise by registry order. Both
transports build their chooser filters from the registry and, after
connecting, identify the model from the device's services (short and long
UUID forms are normalized) before selecting its characteristics; a device
with no supported service is released with "This device is not a supported
scale", and a model whose protocol the app cannot decode is refused rather
than decoded. The connected status names the identified model. The page
footer lists the registry as **Supported scales**, marking each entry
verified or untested.

The device chooser is filtered to supported scales: on the web, devices
advertising a supported service or a documented name prefix (ORed); on iOS,
the single documented name prefix, because the native plugin combines
criteria with AND and service advertising is unverified. When a filtered
attempt fails or is cancelled (Chrome reports `NotFoundError` when the chooser
is dismissed or nothing matched), the live scale setup offers **Show all
devices**. On the web this opens the browser's chooser with
`acceptAllDevices` (never combined with filters): Web Bluetooth gives the
page no device list and no signal strength, so the browser's own chooser does
the listing and shows its signal bars. On iOS the app scans itself for about
6 s with the plugin's `requestLEScan`, keeps the latest RSSI per device id,
and lists devices sorted by signal strength descending, then by name
alphanumerically (case-insensitive, nameless devices last, shown by id), then
by device id, with a **Stop** button; tapping a device connects to it and
identifies it by its services. A pending scan stops on disconnect, cancel,
a new connection attempt and app teardown. After a successful pick in either
flow the app remembers the scale's id and name in local storage (blocked
storage only means the chooser opens each time). The next **Connect scale**
first tries that scale without the chooser, showing **Connecting to** its
name: on iOS by retrieving the peripheral by id with a 5 s connection bound,
and on the web only where `navigator.bluetooth.getDevices()` exists, by
waiting up to 4 s for an advertisement and then connecting with a 10 s bound.
Chrome currently exposes `getDevices()` and `watchAdvertisements()` only behind
`chrome://flags/#enable-experimental-web-platform-features`, so stable Chrome
shows the filtered chooser on every connection. If the remembered scale cannot
be reached, the filtered chooser opens and a new pick replaces the remembered
scale; if the browser refuses the chooser because the tap has expired, the next
tap opens it directly. The remembered scale cannot be forgotten from the app; clearing the
site data clears it. Filtering, identification, Show all devices, the iOS scan and sort,
remembering and reconnecting are covered only by mocked radios; real-device
behavior on Chrome and iOS, including whether the Ultra Scale connects at
all, is unverified.

The home screen has a **Recipe** picker: one radio card per recipe with its
name, "by" its author, the default dose and water, and the typical finish time
("Done around"). Picking a recipe shows its default dose, or the last valid dose brewed with
it, limits the dose input to that recipe's range, and shows its water for the
chosen dose. The chosen recipe and the last valid dose per recipe are
remembered in browser storage; blocked or cleared storage only means the
defaults are shown.
Beneath the brew panel, a credit line names the author and links to the
original sources; the brew summary repeats it for the brewed recipe. Recipe
names omit the author's name, so credits do not imply endorsement. The guide's
limits are documented in this README only, not in the app.

**Get ready** opens the ready screen: three preparation reminders, the bold
prompt to tap **Start now** as the water lands, then **Start now** alone in
timer mode or beside **Auto start on weight change** with a scale, and a
secondary recipe preview. **Next step** or the Right arrow
opens the step layout at the first step; the previous/next buttons or
Left/Right arrow keys move through the recipe. Previewing hides start and arm
controls; **Go to start**, or stepping back before the first step, restores
them.
Previewing never starts a timer or produces scale measurements.

While brewing, the screen splits in two. The left pane is the current step: its
headline (pours name their scaled target, such as "Pour to 100 g"), a pixel-art
scene of the action, and the time left in the step (the largest number during
swirls and waits). The right pane, muted, is the next step: its headline, a
still frame of its scene, and the countdown to it; during drawdown it says to
finish when dripping stops. The compact progress strip follows. The elapsed
timer stays small in the top corner. While previewing, the left pane also shows
the step's one-line hint from the recipe data; hints are not shown while brewing.
The page header holds the session controls: in live mode **Connect scale**, or
once connected **Disconnect** and a fixed-width weight button reading the
identified model and the current weight, captioned **Press to tare**, which
tares the scale when tapped (the caption reads **Taring…** meanwhile); then
**Hold to cancel** once the brew is armed or brewing. Before the start, tapping
the **Pourover Wizard** brand returns to the home screen.
**Auto start on weight change** stays on the ready screen. Both modes brew with a compact
progress strip showing the recipe shape, step boundaries, swirl bands and the
current guidance position. In live mode, each pour step adds a taller panel
beneath the strip that zooms into that pour's time and gram range: the ideal
ramp is dashed, measured weight is solid, and a dot marks the newest fresh
reading; readings inside swirl and stir intervals are not drawn. The summary and the
stopped-brew screen show the full chart. Scenes are inline SVG frames; reduced motion shows
a single still frame. The brewing screen does not explain the guide's limits;
they are documented in this README only.

Tare and opening the screen never arm or start a brew. Detection requires fresh
consecutive rises totaling at least 3 g over at least 500 ms and backdates start
to the rise baseline. The first manual or detected start wins. These thresholds
need validation with the physical scale.

Hold **Hold to cancel**, Space, or Enter for one physical second; the button
fills from the bottom as the hold progresses. Early release, pointer
cancellation, lost focus, or page hiding resets the hold. Cancelling a running
brew shows the cancelled screen; tapping the brand before the start, or a
completed hold while armed, returns to the home screen directly. **Done** appears only once drawdown starts and manually ends
the brew. Hash changes do not switch screens and leave the in-memory brew
running; reload clears it. No history is saved.

### Recipes

Recipes are data in [`recipes.ts`](src/core/recipes.ts): fixed step times,
cumulative water fractions, a dose range, and a finish guide. Each pour step
runs until the next step begins, so short pours are followed by explicit waits,
and linear pour ramps are modeled approximations. The dose picker scales water
while retaining timing; only each original dose was source-verified, and scaled
brewing results remain untested. Swirls and spoon stirs are both modeled as
scale disturbances with hidden readings.

- **Better 1 Cup V60** (James Hoffmann): 15 g coffee, 250 g water, doses
  10–25 g, done around 3:00. Timing was checked against the original video's
  [4:46 table](https://www.youtube.com/watch?v=1oB1oDrDkHM&t=286s), with captions and
  [Hario's reference](https://www.hario-usa.com/blogs/recipes-and-more-from-friends/james-hoffmann-1-cup-v60-technique)
  corroborating. The guide reaches 250 g at 2:00 and starts drawdown after the
  final swirl at 2:05.
- **Ultimate V60** (James Hoffmann): 30 g coffee, 500 g water, doses 20–40 g,
  done around 3:30. [Hario's reference](https://www.hario-usa.com/blogs/recipes-and-more-from-friends/james-hoffmann-uitimate-v60-technique)
  was checked for the 60 g bloom of up to 45 s, the pour to 300 g from 0:45 over
  30 s, the pour to 500 g from 1:15 over 30 s, one stir each way with a spoon,
  a gentle swirl after some drainage, and finishing drawdown by 3:30. The source
  gives no clock times for the bloom swirl, the stir or the final swirl; the
  guide models them at 0:10, 1:45 and 2:00, each five seconds long, with
  drawdown from 2:05. The [original video](https://www.youtube.com/watch?v=AI4ynXzkSQo)
  is linked but was not re-checked.
- **4:6 Method** (Tetsu Kasuya): 20 g coffee, 300 g water, doses 15–30 g,
  dripper removed at 3:30. [Philocoffea's guide](https://en.philocoffea.com/blogs/blog/coffee-brewing-method)
  gives five 60 g pours at 0:00, 0:45, 1:30, 2:15 and 2:45 and removal at 3:30;
  the guide uses those times. The source does not state pour durations, so each
  pour is modeled as 10 s followed by a wait, and the first two pours are
  labeled Sweetness and the rest Strength per the method's description.

Scott Rao's recipe is deferred: its third pour is triggered by drainage rather
than the clock, and the engine is time-locked.

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
off transitions. Purple bands mark the prescribed swirl and stir intervals (for
Better 1 Cup, 0:10–0:15 and 2:00–2:05). Movement readings are hidden from the
actual trace and chart scale in those intervals, with no line bridging them; the
purple dashed plateau is guidance, not a measurement. Session samples remain
unchanged. Negative display/chart readings are clamped to zero without changing
raw samples; above-target readings outside swirl and stir intervals expand the
chart scale; extended drawdown expands the time axis. Swirling or stirring
outside the prescribed intervals is not detected.

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
and recipes are cached; a later offline launch, and a reload of the hash URL,
work without a network connection. Installation is optional. HTTPS is required except on
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
