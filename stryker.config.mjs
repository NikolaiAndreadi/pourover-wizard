import { readFileSync } from "node:fs";

// Mutate recipe behavior after its source-verified data/prose declaration.
// Derive the range so formatting changes cannot silently move the boundary.
const recipeSource = readFileSync("src/core/recipe.ts", "utf8");
const recipeStart = recipeSource.indexOf("export function validateRecipe");
if (recipeStart < 0) throw new Error("Recipe mutation boundary not found.");
const startLine = recipeSource.slice(0, recipeStart).split("\n").length;
const endLine = recipeSource.split("\n").length;

/** Diagnostics only: surviving mutants require review, not a percentage gate. */
export default {
  mutate: [
    "src/core/engine.ts",
    "src/core/detector.ts",
    "src/core/settled.ts",
    `src/core/recipe.ts:${startLine}-${endLine}`,
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
