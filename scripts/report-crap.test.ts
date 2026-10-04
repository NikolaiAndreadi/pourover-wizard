import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  crapScore,
  functionCoverage,
  joinReports,
  offenders,
  parseComplexityMessage,
} from "./crap.mjs";

const range = (
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number | null,
) => ({
  start: { line: startLine, column: startColumn },
  end: { line: endLine, column: endColumn },
});

const complexity = (message: string, line: number, column: number) => ({
  message,
  line,
  column,
  endLine: line,
  endColumn: column + 2,
});

// One file: a named function whose body spans lines 2-6 with a nested arrow
// whose `=>` sits on line 4 below its multi-line parameter list, plus a class
// field initializer on line 8 that V8 does not record as a function.
const file = {
  path: "/repo/src/core/sample.ts",
  statementMap: {
    "0": range(2, 2, 2, null),
    "1": range(3, 2, 5, null),
    "2": range(5, 4, 5, null),
    "3": range(6, 2, 6, null),
    "4": range(8, 20, 8, null),
  },
  fnMap: {
    "0": {
      name: "outer",
      decl: range(1, 16, 1, 21),
      loc: range(1, 40, 7, null),
    },
    "1": {
      name: "(anonymous_1)",
      decl: range(3, 10, 3, null),
      loc: range(5, 4, 5, null),
    },
  },
  s: { "0": 3, "1": 3, "2": 0, "3": 0, "4": 1 },
  f: { "0": 3, "1": 0 },
};
const report = [
  {
    file: "src/core/sample.ts",
    messages: [
      complexity(
        "Function 'outer' has a complexity of 5. Maximum allowed is 0.",
        1,
        8,
      ),
      complexity(
        "Arrow function has a complexity of 2. Maximum allowed is 0.",
        4,
        10,
      ),
      complexity(
        "Class field initializer has a complexity of 1. Maximum allowed is 0.",
        8,
        21,
      ),
    ],
  },
];

describe("CRAP score", () => {
  it("follows complexity² × (1 − coverage)³ + complexity", () => {
    expect(crapScore(4, 1)).toBe(4);
    expect(crapScore(4, 0)).toBe(20);
    expect(crapScore(10, 0.5)).toBeCloseTo(22.5);
    expect(crapScore(30, 1)).toBe(30);
    expect(crapScore(6, 0)).toBe(42);
  });

  it("parses ESLint complexity warnings", () => {
    expect(
      parseComplexityMessage(
        "Function 'stepAt' has a complexity of 4. Maximum allowed is 0.",
      ),
    ).toEqual({ name: "stepAt", complexity: 4 });
    expect(
      parseComplexityMessage(
        "Arrow function has a complexity of 12. Maximum allowed is 0.",
      ),
    ).toEqual({ name: "(arrow function)", complexity: 12 });
    expect(
      parseComplexityMessage(
        "Method 'push' has a complexity of 13. Maximum allowed is 0.",
      ),
    ).toEqual({ name: "push", complexity: 13 });
    expect(parseComplexityMessage("Unexpected token")).toBeUndefined();
  });

  it("measures coverage from the statements inside a function", () => {
    const [outer, arrow] = Object.values(file.fnMap);
    if (!outer || !arrow) throw new Error("fixture functions missing");
    expect(functionCoverage(outer, 3, file)).toBeCloseTo(2 / 4);
    expect(functionCoverage(arrow, 0, file)).toBe(0);
    const bodiless = {
      name: "id",
      decl: range(9, 0, 9, 5),
      loc: range(9, 9, 9, 10),
    };
    expect(functionCoverage(bodiless, 1, file)).toBe(1);
    expect(functionCoverage(bodiless, 0, file)).toBe(0);
  });

  it("joins complexity to coverage by function head and reports gaps", () => {
    const { functions, warnings } = joinReports(
      { [file.path]: file },
      report,
      "/repo",
    );
    expect(
      functions.map((entry) => [entry.name, entry.line, entry.coverage]),
    ).toEqual([
      ["outer", 1, 0.5],
      ["(arrow function)", 4, 0],
      ["(class field initializer)", 8, 1],
    ]);
    expect(functions[0]?.crap).toBeCloseTo(25 * 0.125 + 5);
    expect(warnings).toEqual([]);

    const orphan = {
      file: "src/core/sample.ts",
      messages: [
        ...(report[0]?.messages ?? []),
        complexity(
          "Function 'ghost' has a complexity of 3. Maximum allowed is 0.",
          12,
          1,
        ),
      ],
    };
    const unmatched = joinReports(
      {
        [file.path]: file,
        "/repo/src/core/extra.ts": { ...file, path: "/repo/src/core/extra.ts" },
      },
      [orphan],
      "/repo",
    );
    expect(
      unmatched.functions.find((entry) => entry.name === "ghost"),
    ).toMatchObject({
      coverage: 0,
      crap: 12,
    });
    expect(unmatched.warnings).toEqual([
      expect.stringContaining(
        "sample.ts:12 ghost: complexity without coverage data",
      ),
      expect.stringContaining("src/core/extra.ts: covered but absent"),
    ]);
  });

  it("flags functions strictly above the threshold", () => {
    const entries = [
      {
        file: "a.ts",
        name: "a",
        line: 1,
        complexity: 30,
        coverage: 1,
        crap: 30,
      },
      {
        file: "a.ts",
        name: "b",
        line: 2,
        complexity: 6,
        coverage: 0,
        crap: 42,
      },
    ];
    expect(offenders(entries, 30).map((entry) => entry.name)).toEqual(["b"]);
  });

  it("exits 1 for missing reports and for offenders", () => {
    const script = path.join(process.cwd(), "scripts/report-crap.mjs");
    const fixture = mkdtempSync(path.join(tmpdir(), "crap-report-"));
    try {
      const missing = spawnSync(process.execPath, [script], {
        cwd: fixture,
        encoding: "utf8",
      });
      expect(missing.status).toBe(1);
      expect(missing.stderr).toContain("npm run test:coverage");

      mkdirSync(path.join(fixture, "reports/coverage"), { recursive: true });
      const covered = {
        ...file,
        path: path.join(fixture, "src/core/sample.ts"),
      };
      writeFileSync(
        path.join(fixture, "reports/coverage/coverage-final.json"),
        JSON.stringify({ [covered.path]: covered }),
      );
      const noComplexity = spawnSync(process.execPath, [script], {
        cwd: fixture,
        encoding: "utf8",
      });
      expect(noComplexity.status).toBe(1);
      expect(noComplexity.stderr).toContain("npm run report:complexity");

      writeFileSync(
        path.join(fixture, "reports/complexity.json"),
        JSON.stringify(report),
      );
      const passing = spawnSync(process.execPath, [script], {
        cwd: fixture,
        encoding: "utf8",
      });
      expect(passing.status, passing.stderr).toBe(0);
      expect(passing.stdout).toContain("CRAP gate passed");

      const risky = [
        {
          file: "src/core/sample.ts",
          messages: [
            complexity(
              "Function 'outer' has a complexity of 20. Maximum allowed is 0.",
              1,
              8,
            ),
          ],
        },
      ];
      writeFileSync(
        path.join(fixture, "reports/complexity.json"),
        JSON.stringify(risky),
      );
      const failing = spawnSync(process.execPath, [script], {
        cwd: fixture,
        encoding: "utf8",
      });
      expect(failing.status).toBe(1);
      expect(failing.stderr).toContain(
        "CRAP gate failed: 1 function(s) above 30",
      );
      expect(failing.stdout).toContain("outer !");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
