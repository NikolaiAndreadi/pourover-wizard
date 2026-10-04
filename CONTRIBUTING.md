# Contributing

Contributions of every kind are welcome:

- **Bluetooth scales.** Support for another scale, or confirmation that an
  untested one works. Open an issue with the model, the advertised Bluetooth
  name, and a few captured weight frames if you can get them; scales are data
  in `src/scale/supported.ts` plus a codec.
- **Bug fixes.** A failing test with the fix is ideal, but a clear report
  with the browser or iOS version and the scale involved already helps.
- **Features.** Open an issue to discuss the idea first if it is large;
  otherwise send a pull request. For a new recipe, link the author's
  original source; the engine is time-locked, so every step needs a clock
  time.

By contributing you agree that your work is licensed under the
[GNU GPL v3](LICENSE), like the rest of the project.

## Toolchain

Use Node **26.10.0** (`nvm use`) and npm **12.2.0**. Install locked
dependencies with `npm ci`, then `npx playwright install chromium` (Linux CI
adds `--with-deps`). Track the latest stable Node Current and the latest
compatible npm when updating the runtime.

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
Vitest uses two workers, Playwright one, and mutation four. On smaller hosts,
use `npm run test:mutation:full -- --concurrency 2`.

Browser tests own their preview server and exercise `/pourover-wizard/`,
including a reload of the hash URL, using an injected clock. Stop any existing
preview on port 4173 first. Failure screenshots and traces land in
`test-results/`, HTML reports in `playwright-report/`, and JUnit reports in
`reports/`. Generated outputs are ignored by git.

### CRAP gate

`npm run report:crap` scores every function that unit coverage measures, that
is `src/core/**/*.ts` and `src/scale/bookoo/codec.ts` without tests, with
CRAP = complexity² × (1 − coverage)³ + complexity, where coverage is the
fraction of the function's own statements the unit tests executed. Any
function above **30**, the classic CRAP threshold, fails the check. UI, app
hooks, transport and platform adapters are out of scope because Playwright
and mocked radios exercise them, not unit coverage, and mutation results stay
ungated. Fix a failure with behavior tests or by simplifying the function; do
not raise the threshold. `reports/crap.json` lists every scored function in
descending order with any join warnings.

### Version pins

Vitest and coverage stay paired at **4.1.11** because
[Stryker issue #6210](https://github.com/stryker-mutator/stryker-js/issues/6210)
affects Vitest 5 nested-test filtering. Before upgrading, prove nested tests
run with known checksum/cancellation mutants, then run fresh mutation and
normal checks.

TypeScript **7.0.2** checks app and DOM-free core through `tsc`.
[Supported side-by-side aliases](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-60)
keep `@typescript/native` on the native compiler and `typescript` on the
classic compatibility package: package **6.0.2**, locked compiler API
**6.0.3**, CLI `tsc6`. The guards, dependency checker, complexity parser, and
Stryker use that classic API; the parser requires TypeScript below 6.1.
After changes, verify `npm exec -- tsc --version`, `npm exec -- tsc6 --version`,
and the version and `createSourceFile` export from `import ts from "typescript"`.

The Capacitor CLI uses `xcode`, whose CommonJS `uuid.v4()` call remains
compatible with the narrowly overridden `uuid` **11.1.1**. This avoids the
older uuid [buffer bounds advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq);
native sync and archive validate the CLI dependency path.

## Architecture

`core/` owns pure recipe and session logic without DOM types: `recipe.ts`
holds the recipe type and its pure functions, `recipes.ts` the recipe data.
Mutation checks cover `recipe.ts` whole and leave the source-verified data in
`recipes.ts` alone. `scale/` owns the supported-scale registry, the BOOKOO
codec and the transport modules. `platform/` holds browser storage adapters,
such as the remembered scale and brew history, and depends only on core and
itself. `app/` composes adapters; `ui/` uses app and type-only core imports.
Dependency checks reject cycles and invalid layer imports; Bluetooth APIs and
native imports belong in `scale/transport/`.

## CI

- **Check** (`.github/workflows/check.yml`) runs on pushes to `main`, pull
  requests and manual dispatch: `npm run check`, then retains the reports and
  the web build for seven days. On `main` it also deploys the verified build
  to GitHub Pages. A manual run can add a fresh mutation pass.
- **iOS** (`.github/workflows/ios.yml`) builds the unsigned IPA on macOS. It
  runs on manual dispatch, where it uploads the IPA as a workflow artifact, and
  on a `v*` tag, where it attaches the IPA and its SHA-256 to the GitHub
  release for that tag.
- **CodeQL** (`.github/workflows/codeql.yml`) scans JavaScript and TypeScript
  on pushes, pull requests and weekly.
- **Dependabot** (`.github/dependabot.yml`) opens weekly update pull requests
  for npm packages and pinned actions.

Workflows use read-only tokens except where a job needs to deploy or publish,
and pin actions to commit SHAs.

### Releasing

```sh
git tag v1.2.0
git push origin v1.2.0
```

The iOS workflow creates the release with the IPA attached. The web app
deploys from every push to `main`, independent of tags.

## iOS build

The native app wraps the same SPA in Capacitor with native Bluetooth LE.
Bundle identifier `com.nikolaiandreadi.pouroverwizard`, deployment target iOS
**15.0**. Browser builds use `/pourover-wizard/` as base; native builds use
root-relative assets in `dist-ios/`, which already contain the web assets and
register no service worker or manifest.

You need macOS, Xcode **26.6** with its iOS platform, and the pinned Node and
npm. Dependencies are pinned to Capacitor **8.5.2** and Bluetooth LE
**8.3.0**; the generated `ios/App/CapApp-SPM/Package.swift` uses the npm
plugin package and the exact Capacitor version, and the committed
`Package.resolved` records the resolved revision. See
[Capacitor's environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup).

```sh
npm ci
npm run ios:package
```

`ios:sync` builds native web assets and synchronizes plugins. `ios:package`
archives the device Release target with signing disabled and packages
`Payload/App.app` as `reports/ios/PouroverWizard.ipa` alongside a SHA-256
file. It clears previous artifacts first, so a failed build leaves no stale
IPA. The IPA is unsigned; SideStore signs it on the device. No Apple account
credentials or pairing records belong in the repository or CI.

Bluetooth permission is requested on first connect using the purpose text in
`ios/App/App/Info.plist`. The in-app **Show all devices** scan uses the same
central role and the same `NSBluetoothAlwaysUsageDescription` key. The app
does not enable Bluetooth background mode. The plugin documents that BLE is
unavailable in the iOS simulator.

### Xcode reports an installed iOS platform as missing

An SDK patch build can select a runtime build that is unavailable even when an
iOS runtime from the same release family is installed. Inspect the selection:

```sh
xcrun simctl runtime match list
xcrun simctl runtime list
```

Try downloading the matching patch first with
`xcodebuild -downloadPlatform iOS -buildVersion <version> -architectureVariant arm64`.
If it is unavailable, a temporary match override can select an installed
runtime from the same release family. For the iOS 26.5 SDK build `23F81a` and
installed 26.5 runtime `23F73`:

```sh
xcrun simctl runtime match set iphoneos26.5 23F73 --sdkBuild 23F81a
npm run ios:package
xcrun simctl runtime match set iphoneos26.5 --default --sdkBuild 23F81a
```

Restore the mapping afterwards. `--default` restores an originally unset user
override; if one was already set, restore that recorded runtime build instead.
Use the build identifiers shown on your machine.
