# Maintenance notes

Notes for whoever updates the toolchain. Contributors do not need any of this;
see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Version pins

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

## Check concurrency

`npm run check` runs at most two tasks concurrently. The coverage run writes
its JUnit result to `reports/unit-coverage.xml` so it never overwrites
`reports/unit.xml`. Vitest uses two workers, Playwright one, and mutation
four. On smaller hosts, use `npm run test:mutation:full -- --concurrency 2`.

Run fresh mutation checks after dependency, configuration, or fixture changes
and before releases; review survivors rather than treating a score as proof.

## Xcode reports an installed iOS platform as missing

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
