import { mkdir, readFile, writeFile } from "node:fs/promises";
import { joinReports, offenders } from "./crap.mjs";

// 30 is the classic CRAP threshold from Savoia and Walker's original crap4j definition.
const CRAP_THRESHOLD = 30;
const COVERAGE_REPORT = "reports/coverage/coverage-final.json";
const COMPLEXITY_REPORT = "reports/complexity.json";
const OUTPUT = "reports/crap.json";

/**
 * @param {string} path
 * @param {string} script npm script that writes the report
 */
async function readReport(path, script) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      console.error(`Missing ${path}; run \`${script}\` first.`);
      process.exit(1);
    }
    throw error;
  }
}

const coverage = await readReport(COVERAGE_REPORT, "npm run test:coverage");
const complexity = await readReport(
  COMPLEXITY_REPORT,
  "npm run report:complexity",
);
const { functions, warnings } = joinReports(
  coverage,
  complexity,
  process.cwd(),
);
const failing = offenders(functions, CRAP_THRESHOLD);

await mkdir("reports", { recursive: true });
await writeFile(
  OUTPUT,
  JSON.stringify(
    {
      threshold: CRAP_THRESHOLD,
      functions: functions.map((entry) => ({
        ...entry,
        coverage: Number(entry.coverage.toFixed(4)),
        crap: Number(entry.crap.toFixed(2)),
      })),
      warnings,
    },
    null,
    2,
  ),
);

for (const warning of warnings) console.warn(`warning: ${warning}`);
const shown = functions.slice(0, Math.max(10, failing.length));
console.log(
  `${"CRAP".padStart(8)} ${"cplx".padStart(4)} ${"cov".padStart(6)}  function`,
);
for (const entry of shown) {
  const flag = entry.crap > CRAP_THRESHOLD ? " !" : "";
  console.log(
    `${entry.crap.toFixed(2).padStart(8)} ${String(entry.complexity).padStart(4)} ${`${Math.round(entry.coverage * 100)}%`.padStart(6)}  ${entry.file}:${entry.line} ${entry.name}${flag}`,
  );
}
if (failing.length > 0) {
  console.error(
    `CRAP gate failed: ${failing.length} function(s) above ${CRAP_THRESHOLD}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `CRAP gate passed: ${functions.length} function(s) at or below ${CRAP_THRESHOLD}; ${OUTPUT}`,
  );
}
