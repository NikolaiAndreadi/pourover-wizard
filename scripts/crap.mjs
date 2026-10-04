import { relative } from "node:path";

// Pure CRAP (Change Risk Anti-Patterns) helpers shared by the report script and
// its unit tests. Inputs are the istanbul-format coverage written by Vitest's v8
// provider and the ESLint complexity report; no file system access happens here.

/** @typedef {{ line: number, column: number | null }} Position */
/** @typedef {{ start: Position, end: Position }} Range */
/** @typedef {{ name: string, decl: Range, loc: Range }} CoverageFunction */
/**
 * @typedef {object} FileCoverage
 * @property {string} path
 * @property {Record<string, Range>} statementMap
 * @property {Record<string, CoverageFunction>} fnMap
 * @property {Record<string, number>} s statement hit counts
 * @property {Record<string, number>} f function hit counts
 */
/**
 * @typedef {object} ComplexityMessage
 * @property {string} message
 * @property {number} line
 * @property {number} column
 * @property {number} [endLine]
 * @property {number} [endColumn]
 */
/** @typedef {{ file: string, messages: ComplexityMessage[] }} ComplexityEntry */
/**
 * @typedef {object} CrapEntry
 * @property {string} file
 * @property {string} name
 * @property {number} line
 * @property {number} complexity
 * @property {number} coverage fraction of statements inside the function that ran
 * @property {number} crap
 */

/**
 * CRAP(fn) = complexity² × (1 − coverage)³ + complexity.
 * @param {number} complexity cyclomatic complexity
 * @param {number} coverage statement coverage fraction, 0..1
 * @returns {number}
 */
export function crapScore(complexity, coverage) {
  return complexity ** 2 * (1 - coverage) ** 3 + complexity;
}

const COMPLEXITY_MESSAGE = /^(.+?) has a complexity of (\d+)\./;

/**
 * Parses ESLint's complexity warning, such as "Function 'stepAt' has a
 * complexity of 4. Maximum allowed is 0." or "Arrow function has a complexity
 * of 2. Maximum allowed is 0."
 * @param {string} message
 * @returns {{ name: string, complexity: number } | undefined}
 */
export function parseComplexityMessage(message) {
  const match = COMPLEXITY_MESSAGE.exec(message);
  if (!match) return undefined;
  const label = match[1] ?? "";
  const quoted = /'([^']+)'/.exec(label);
  return {
    name: quoted?.[1] ?? `(${label.toLowerCase()})`,
    complexity: Number(match[2]),
  };
}

/** @param {number | null | undefined} column */
const columnOf = (column) =>
  column === null || column === undefined ? Number.POSITIVE_INFINITY : column;

/**
 * @param {Position} a
 * @param {Position} b
 * @returns {boolean} whether a is at or before b
 */
const atOrBefore = (a, b) =>
  a.line < b.line ||
  (a.line === b.line && columnOf(a.column) <= columnOf(b.column));

/**
 * @param {Range} range
 * @param {Range} outer
 * @returns {boolean}
 */
const within = (range, outer) =>
  atOrBefore(outer.start, range.start) && atOrBefore(range.end, outer.end);

/**
 * @param {FileCoverage} file
 * @param {(range: Range) => boolean} selects
 * @returns {{ total: number, covered: number }}
 */
function countStatements(file, selects) {
  let total = 0;
  let covered = 0;
  for (const [id, range] of Object.entries(file.statementMap)) {
    if (!selects(range)) continue;
    total += 1;
    if ((file.s[id] ?? 0) > 0) covered += 1;
  }
  return { total, covered };
}

/**
 * Statement coverage of one function: covered statements inside its `loc`
 * divided by all statements inside it. A function without statements, such as
 * an expression-bodied arrow, counts as covered when it was called at all.
 * @param {CoverageFunction} fn
 * @param {number} hits the function's own hit count
 * @param {FileCoverage} file
 * @returns {number}
 */
export function functionCoverage(fn, hits, file) {
  const { total, covered } = countStatements(file, (range) =>
    within(range, fn.loc),
  );
  if (total === 0) return hits > 0 ? 1 : 0;
  return covered / total;
}

/**
 * Coverage of the statements that start on the given lines. Used for ESLint
 * "functions" V8 does not record, such as class field initializers.
 * @param {FileCoverage} file
 * @param {number} fromLine
 * @param {number} toLine
 * @returns {number | undefined} undefined when no statement starts there
 */
export function lineCoverage(file, fromLine, toLine) {
  const { total, covered } = countStatements(
    file,
    (range) => range.start.line >= fromLine && range.start.line <= toLine,
  );
  return total === 0 ? undefined : covered / total;
}

/** @param {string} file */
const toPosix = (file) => file.split("\\").join("/");

/**
 * Joins complexity warnings to coverage functions file by file. A warning
 * belongs to the function whose head, from the declaration line to the line
 * where the body starts, contains the warning line; ESLint reports arrow
 * functions at their `=>`, which may sit on a line of its own below a
 * multi-line parameter list. Heads sharing a line pair in source order.
 * @param {Record<string, FileCoverage>} coverage keyed by absolute path
 * @param {ComplexityEntry[]} complexity
 * @param {string} root directory the complexity paths are relative to
 * @returns {{ functions: CrapEntry[], warnings: string[] }}
 */
export function joinReports(coverage, complexity, root) {
  /** @type {CrapEntry[]} */
  const functions = [];
  /** @type {string[]} */
  const warnings = [];
  const coverageByFile = new Map(
    Object.values(coverage).map((file) => [
      toPosix(relative(root, file.path)),
      file,
    ]),
  );
  const complexityFiles = new Set(
    complexity.map((entry) => toPosix(entry.file)),
  );
  for (const entry of complexity) {
    const fileName = toPosix(entry.file);
    const file = coverageByFile.get(fileName);
    const candidates = file
      ? Object.entries(file.fnMap)
          .map(([id, fn]) => ({ fn, hits: file.f[id] ?? 0, matched: false }))
          .sort(
            (a, b) =>
              a.fn.decl.start.line - b.fn.decl.start.line ||
              columnOf(a.fn.decl.start.column) -
                columnOf(b.fn.decl.start.column),
          )
      : [];
    const messages = entry.messages
      .map((message) => ({
        ...message,
        parsed: parseComplexityMessage(message.message),
      }))
      .sort((a, b) => a.line - b.line || a.column - b.column);
    for (const message of messages) {
      if (!message.parsed) continue;
      const { name, complexity: value } = message.parsed;
      const candidate = candidates.find(
        (item) =>
          !item.matched &&
          item.fn.decl.start.line <= message.line &&
          message.line <= item.fn.loc.start.line,
      );
      let covered = 0;
      if (candidate && file) {
        candidate.matched = true;
        covered = functionCoverage(candidate.fn, candidate.hits, file);
      } else {
        const fromLines = file
          ? lineCoverage(file, message.line, message.endLine ?? message.line)
          : undefined;
        if (fromLines === undefined) {
          warnings.push(
            `${fileName}:${message.line} ${name}: complexity without coverage data; coverage counted as 0`,
          );
        } else {
          covered = fromLines;
        }
      }
      functions.push({
        file: fileName,
        name,
        line: message.line,
        complexity: value,
        coverage: covered,
        crap: crapScore(value, covered),
      });
    }
    for (const item of candidates) {
      if (item.matched) continue;
      warnings.push(
        `${fileName}:${item.fn.decl.start.line} ${item.fn.name}: coverage without a complexity entry; not scored`,
      );
    }
  }
  for (const fileName of coverageByFile.keys()) {
    if (!complexityFiles.has(fileName)) {
      warnings.push(
        `${fileName}: covered but absent from the complexity report; not scored`,
      );
    }
  }
  functions.sort(
    (a, b) =>
      b.crap - a.crap || a.file.localeCompare(b.file) || a.line - b.line,
  );
  return { functions, warnings };
}

/**
 * @param {CrapEntry[]} functions
 * @param {number} threshold functions strictly above it fail the gate
 * @returns {CrapEntry[]}
 */
export function offenders(functions, threshold) {
  return functions.filter((entry) => entry.crap > threshold);
}
