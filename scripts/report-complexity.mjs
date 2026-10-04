import { mkdir, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import parser from "@typescript-eslint/parser";
import { ESLint } from "eslint";

// ESLint's classic cyclomatic complexity; warnings are diagnostics, not gates.
// scripts/report-crap.mjs joins this report with coverage to gate CRAP scores.
const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["src/core/**/*.ts", "src/scale/bookoo/codec.ts"],
      ignores: ["**/*.test.ts"],
      languageOptions: { parser },
      rules: { complexity: ["warn", { max: 0, variant: "classic" }] },
    },
  ],
});
const results = await eslint.lintFiles([
  "src/core/**/*.ts",
  "src/scale/bookoo/codec.ts",
]);
await mkdir("reports", { recursive: true });
await writeFile(
  "reports/complexity.json",
  JSON.stringify(
    results.map((result) => ({
      file: relative(process.cwd(), result.filePath),
      messages: result.messages,
    })),
    null,
    2,
  ),
);
for (const result of results) {
  for (const message of result.messages) {
    console.log(
      `${relative(process.cwd(), result.filePath)}:${message.line} ${message.message}`,
    );
  }
}
if (results.some((result) => result.fatalErrorCount > 0)) process.exitCode = 1;
