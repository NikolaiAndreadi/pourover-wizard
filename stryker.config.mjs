/** Diagnostics only: surviving mutants require review, not a percentage gate. */
export default {
  mutate: [
    "src/core/engine.ts",
    "src/core/detector.ts",
    "src/core/settled.ts",
    // Recipe functions only; the source-verified data in recipes.ts is not mutated.
    "src/core/recipe.ts",
    "src/scale/bookoo/codec.ts",
  ],
  // Native projects and browser artifacts are not inputs to Vitest mutation checks.
  ignorePatterns: [
    "/reports",
    "/ios",
    "/dist",
    "/dist-ios",
    "/test-results",
    "/playwright-report",
  ],
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.ts" },
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  concurrency: 4,
  incremental: true,
  incrementalFile: "reports/mutation/incremental.json",
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  thresholds: { high: 80, low: 60, break: null },
  tempDirName: ".stryker-tmp",
};
