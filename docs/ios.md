# iOS and SideStore

The native app displays **Pourover Wizzard** and uses stable bundle identifier
`com.nikolaiandreadi.pouroverwizard`. It wraps the same SPA in Capacitor, with
native BLE selected for both brewing and the BOOKOO lab. Browser builds retain
`/pourover-wizard/`; native builds use root-relative assets in `dist-ios/`.

## Build a private device artifact

Use the repository's pinned Node/npm runtime, macOS, Xcode **26.6**, and its iOS
platform component. The deployment target is iOS **15.0**. Dependencies are pinned
to Capacitor **8.5.2** and Bluetooth LE **8.3.0**; generated
`ios/App/CapApp-SPM/Package.swift` uses the npm plugin package and exact Capacitor
version. The committed workspace `Package.resolved` records its remote revision.
See [Capacitor's environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup)
and the [plugin's 8.3.0 manifest](https://github.com/capacitor-community/bluetooth-le/blob/v8.3.0/Package.swift).

```sh
npm ci
npm run check
npm run ios:package
```

`ios:sync` builds native web assets and synchronizes plugins. `ios:package` then
archives the device Release target with signing disabled and packages
`Payload/App.app` as `reports/ios/PouroverWizzard.ipa`, alongside a SHA-256 file.
It clears previous artifacts before building, so a failed build leaves no stale
IPA. Generated web files, archives, and derived data stay outside commits.
The artifact is unsigned and cannot be directly installed through Apple's
ordinary device installation tools. SideStore must apply device signing.

The manual **Private iOS artifact** workflow runs only against `main`, checks the
app, and retains the IPA and verification logs for seven days. It uses read-only
repository permissions and publishes no release or download feed. Download the
artifact while authenticated, unzip it, and transfer the IPA privately to Files
on the phone. No Apple account credentials or pairing records belong in this
repository or CI.

### Xcode reports an installed iOS platform as missing

An SDK patch build can select a runtime build that is unavailable even when an
iOS runtime from the same release family is installed. Inspect the selection
and available builds using Apple's `simctl` commands:

```sh
xcrun simctl runtime match list
xcrun simctl runtime list
```

Record the SDK canonical name, SDK build, current user override, and installed
runtime build. Try downloading the matching patch first with
`xcodebuild -downloadPlatform iOS -buildVersion <version> -architectureVariant arm64`.
If it is unavailable, a temporary match override can select an installed runtime
from the same release family. For the iOS 26.5 SDK build `23F81a` and installed
26.5 runtime `23F73`, the documented command syntax is:

```sh
xcrun simctl runtime match set iphoneos26.5 23F73 --sdkBuild 23F81a
npm run ios:package
xcrun simctl runtime match set iphoneos26.5 --default --sdkBuild 23F81a
```

Restore the mapping after either success or failure. `--default` restores an
originally unset user override; if one was already set, restore that recorded
runtime build instead. Verify restoration with `runtime match list`. Use the
build identifiers shown on your machine, not the example when they differ;
`xcrun simctl runtime` describes the matching policy and commands. This temporary
toolchain workaround provides build evidence and establishes no hardware behavior.

## Import and acceptance

Set up SideStore using its [official installation documentation](https://docs.sidestore.io/docs/intro).
In SideStore's My Apps screen, use the import button to select the IPA from Files.
SideStore signs apps using the user's development certificate and refreshes them;
free accounts have app and App ID limits. Consult the
[SideStore FAQ](https://docs.sidestore.io/docs/faq) for current constraints.
Unsigned artifact import, installation, launch, and refresh must be verified on
the actual phone; a successful archive does not establish these behaviors.

Connections are explicit and foreground only. Bluetooth permission is requested
when connecting, using the purpose text in `ios/App/App/Info.plist`. The app
does not enable Bluetooth background mode. Keep it visible and the phone awake
for brewing; background suspension may interrupt notifications and JavaScript
timing. There is no accepted background brewing behavior. Cancelling a pending
connection ignores its result; the system chooser may still need to be dismissed
before the next connection begins. The
[plugin documentation](https://github.com/capacitor-community/bluetooth-le/tree/v8.3.0)
states that BLE is unavailable in the iOS simulator.

Before accepting the native app, record exact phone/iOS, SideStore, scale firmware,
and app build versions. Verify permission denial and retry; chooser cancellation;
the [BOOKOO calibration and command checklist](bookoo-lab.md); both manual start
and explicitly armed detection; hold cancellation; disconnect/reconnect while
brewing; movement between lab and brewing without duplicate callbacks; notch and
home indicator layout in portrait/landscape; and SideStore refresh and relaunch.
Compare physical weight/timer displays, retaining annotated raw recordings.

Lab downloads currently use the browser Blob download path. Saving and importing
JSON through WKWebView/Files is **unverified**. If export does not work on the
phone, capture calibration evidence using Mac Chrome; native export needs an
adapter before iPhone-only recording acceptance. File import, native BLE, and
SideStore checks remain hardware acceptance work, not automated test results.
