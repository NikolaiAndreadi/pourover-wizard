import type { Mode } from "@/core/engine";
import {
  type Recipe,
  type RecipeSource,
  type RecipeStep,
  validateRecipe,
} from "@/core/recipe";
import type { ScaleSample } from "@/core/scale";

export interface BrewRecord {
  id: string;
  /** Completion instant as an ISO 8601 UTC string, e.g. "2026-10-04T09:03:52.146Z". */
  completedAt: string;
  mode: Mode;
  /** The scaled recipe the brew actually ran, so later recipe edits never change a past brew. */
  recipe: Recipe;
  elapsedMs: number;
  pouredGrams: number | null;
  /** Relative to brew start. */
  samples: readonly ScaleSample[];
}
export interface BrewHistory {
  /** Newest first. */
  load(): BrewRecord[];
  add(record: BrewRecord): void;
  remove(id: string): void;
  clear(): void;
}
export const HISTORY_LIMIT = 50;
const KEY = "pourover-wizard.history";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const ACTIONS: ReadonlySet<unknown> = new Set([
  "pour",
  "swirl",
  "stir",
  "wait",
  "drawdown",
]);
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isText = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number";
const isFinite = (value: unknown): value is number =>
  isNumber(value) && Number.isFinite(value);
const isAmount = (value: unknown): value is number =>
  isFinite(value) && value >= 0;
const isOptional = <T>(
  value: unknown,
  check: (value: unknown) => value is T,
): value is T | undefined => value === undefined || check(value);
function parseAll<T>(
  value: unknown,
  parse: (item: unknown) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: T[] = [];
  for (const item of value) {
    const parsed = parse(item);
    if (parsed === undefined) return undefined;
    items.push(parsed);
  }
  return items;
}
function parseSample(value: unknown): ScaleSample | undefined {
  if (
    !isObject(value) ||
    !isAmount(value.atMs) ||
    !isFinite(value.grams) ||
    !isOptional(value.segment, isFinite)
  )
    return undefined;
  const { atMs, grams, segment } = value;
  return segment === undefined ? { atMs, grams } : { atMs, grams, segment };
}
function parseSource(value: unknown): RecipeSource | undefined {
  return isObject(value) && isText(value.label) && isText(value.url)
    ? { label: value.label, url: value.url }
    : undefined;
}
function parseStep(value: unknown): RecipeStep | undefined {
  if (
    !isObject(value) ||
    !isNumber(value.atMs) ||
    !ACTIONS.has(value.action) ||
    !isText(value.label) ||
    !isNumber(value.targetFraction) ||
    !isOptional(value.stage, isText) ||
    !isOptional(value.hint, isText)
  )
    return undefined;
  const step: RecipeStep = {
    atMs: value.atMs,
    action: value.action as RecipeStep["action"],
    label: value.label,
    targetFraction: value.targetFraction,
  };
  if (value.stage !== undefined) step.stage = value.stage;
  if (value.hint !== undefined) step.hint = value.hint;
  return step;
}
function parseRecipe(value: unknown): Recipe | undefined {
  if (
    !isObject(value) ||
    !isText(value.id) ||
    !isText(value.name) ||
    !isText(value.author) ||
    !isText(value.summary) ||
    !isNumber(value.doseGrams) ||
    !isNumber(value.waterGrams) ||
    !isNumber(value.minDoseGrams) ||
    !isNumber(value.maxDoseGrams) ||
    !isNumber(value.finishGuideMs)
  )
    return undefined;
  const sources = parseAll(value.sources, parseSource);
  const steps = parseAll(value.steps, parseStep);
  if (!sources || !steps) return undefined;
  const recipe: Recipe = {
    id: value.id,
    name: value.name,
    author: value.author,
    sources,
    summary: value.summary,
    doseGrams: value.doseGrams,
    waterGrams: value.waterGrams,
    minDoseGrams: value.minDoseGrams,
    maxDoseGrams: value.maxDoseGrams,
    finishGuideMs: value.finishGuideMs,
    steps,
  };
  try {
    validateRecipe(recipe);
    return recipe;
  } catch {
    return undefined;
  }
}
function parseRecord(value: unknown): BrewRecord | undefined {
  if (
    !isObject(value) ||
    !isText(value.id) ||
    value.id === "" ||
    !isText(value.completedAt) ||
    Number.isNaN(Date.parse(value.completedAt)) ||
    (value.mode !== "timer" && value.mode !== "live") ||
    !isAmount(value.elapsedMs) ||
    !(value.pouredGrams === null || isAmount(value.pouredGrams))
  )
    return undefined;
  const recipe = parseRecipe(value.recipe);
  const samples = parseAll(value.samples, parseSample);
  if (!recipe || !samples) return undefined;
  return {
    id: value.id,
    completedAt: value.completedAt,
    mode: value.mode,
    recipe,
    elapsedMs: value.elapsedMs,
    pouredGrams: value.pouredGrams,
    samples,
  };
}
/**
 * Keeps finished brews in browser storage, newest first. Private windows,
 * blocked storage, quota errors and corrupt values all behave as an empty
 * history; a single corrupt brew is dropped without losing the others.
 */
export function createBrewHistory(
  storage: () => Store | undefined = () => globalThis.localStorage,
): BrewHistory {
  const load = (): BrewRecord[] => {
    try {
      const raw = storage()?.getItem(KEY);
      if (!raw) return [];
      const value: unknown = JSON.parse(raw);
      if (!isObject(value) || !Array.isArray(value.brews)) return [];
      const seen = new Set<string>();
      const records: BrewRecord[] = [];
      for (const item of value.brews) {
        const record = parseRecord(item);
        if (record && !seen.has(record.id)) {
          seen.add(record.id);
          records.push(record);
        }
      }
      return records;
    } catch {
      return [];
    }
  };
  const save = (records: BrewRecord[]) => {
    // Over quota, the brew just finished is worth more than the oldest one.
    let kept = records;
    for (;;) {
      try {
        storage()?.setItem(KEY, JSON.stringify({ brews: kept }));
        return;
      } catch {
        if (kept.length <= 1) return;
        kept = kept.slice(0, -1);
      }
    }
  };
  return {
    load,
    add(record) {
      const others = load().filter((item) => item.id !== record.id);
      save([record, ...others].slice(0, HISTORY_LIMIT));
    },
    remove(id) {
      save(load().filter((item) => item.id !== id));
    },
    clear() {
      try {
        storage()?.removeItem(KEY);
      } catch {
        save([]);
      }
    },
  };
}
