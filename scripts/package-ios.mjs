import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

if (process.platform !== "darwin")
  throw new Error("iOS packaging requires macOS and Xcode 26 or newer.");
const output = path.resolve("reports/ios");
const archive = path.join(output, "PouroverWizard.xcarchive");
const staging = path.join(output, "staging");
const ipa = path.join(output, "PouroverWizard.ipa");
await mkdir(output, { recursive: true });
await rm(ipa, { force: true });
await rm(`${ipa}.sha256`, { force: true });
await rm(archive, { recursive: true, force: true });
await rm(staging, { recursive: true, force: true });
execFileSync(
  "xcodebuild",
  [
    "-project",
    "ios/App/App.xcodeproj",
    "-scheme",
    "App",
    "-configuration",
    "Release",
    "-destination",
    "generic/platform=iOS",
    "-archivePath",
    archive,
    "-derivedDataPath",
    path.join(output, "DerivedData"),
    "-onlyUsePackageVersionsFromResolvedFile",
    "CODE_SIGNING_ALLOWED=NO",
    "CODE_SIGNING_REQUIRED=NO",
    "CODE_SIGN_IDENTITY=",
    "archive",
  ],
  { stdio: "inherit" },
);
const app = path.join(staging, "Payload/App.app");
await mkdir(path.dirname(app), { recursive: true });
await cp(path.join(archive, "Products/Applications/App.app"), app, {
  recursive: true,
});
await rm(ipa, { force: true });
execFileSync(
  "ditto",
  ["-c", "-k", "--sequesterRsrc", "--keepParent", "Payload", ipa],
  {
    cwd: staging,
    stdio: "inherit",
  },
);
const hash = createHash("sha256")
  .update(await readFile(ipa))
  .digest("hex");
await writeFile(`${ipa}.sha256`, `${hash}  PouroverWizard.ipa\n`);
await rm(staging, { recursive: true, force: true });
console.log(
  `Unsigned device IPA: ${ipa}\nSideStore must sign it before device installation. Import and hardware acceptance remain unverified.`,
);
