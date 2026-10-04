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

Node **26.10.0** (`nvm use`) and npm **12.2.0**. Then:

```sh
npm ci
npx playwright install chromium
```

Installing points Git at `.githooks/`, whose `pre-push` hook runs
`npm run check`. Skip it once with `git push --no-verify`.

| Command              | Purpose                                                             |
|----------------------|---------------------------------------------------------------------|
| `npm run dev`        | Local app at `/pourover-wizard/`                                    |
| `npm run check:fast` | Type checks, Biome, dependency and Bluetooth boundaries, unit tests |
| `npm run test:watch` | Unit tests while editing                                            |
| `npm run check`      | Fast checks, Playwright, coverage, complexity and the CRAP gate     |
| `npm run format`     | Format source and configuration                                     |

The remaining scripts in `package.json` produce individual reports under
`reports/`, run mutation tests, or build the iOS app.

Browser tests build the app and own their preview server on port 4173, so
stop any running preview first. Failure screenshots and traces land in
`test-results/`.

The CRAP gate scores every function under `src/core/` and the BOOKOO codec
from unit coverage and cyclomatic complexity. Anything above **30** fails the
check; fix it with behavior tests or by simplifying the function, not by
raising the threshold.

Why specific versions are pinned, and how to recover from a mismatched Xcode
runtime, is in [docs/maintenance.md](docs/maintenance.md).

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
**15.0**. Native builds use root-relative assets in `dist-ios/` and register
no service worker or manifest.

You need macOS and Xcode **26.6** with its iOS platform; see
[Capacitor's environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup).
The generated `ios/App/CapApp-SPM/Package.swift` and the committed
`Package.resolved` pin the Capacitor packages to the npm versions.

```sh
npm run ios:package
```

This builds the web assets, syncs plugins, archives the device Release target
with signing disabled and writes `reports/ios/PouroverWizard.ipa` with a
SHA-256 file. The IPA is unsigned; SideStore signs it on the device. No Apple
account credentials or pairing records belong in the repository or CI.

Bluetooth permission is requested on first connect using the purpose text in
`ios/App/App/Info.plist`. The app does not enable Bluetooth background mode,
and BLE is unavailable in the iOS simulator.
