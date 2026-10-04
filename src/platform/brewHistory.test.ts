import { describe, expect, it } from "vitest";
import { scaleRecipe } from "@/core/recipe";
import { recipes } from "@/core/recipes";
import {
  type BrewRecord,
  createBrewHistory,
  HISTORY_LIMIT,
} from "./brewHistory";

const KEY = "pourover-wizard.history";
const source = recipes[0];
if (!source) throw new Error("Test needs a bundled recipe.");
const recipe = scaleRecipe(source.doseGrams, source);
function memoryStorage(limit = Number.POSITIVE_INFINITY) {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (value.length > limit) throw new Error("QuotaExceededError");
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
/** Same-length ids and timestamps keep every record's serialized size equal. */
function record(n: number, extra: Partial<BrewRecord> = {}): BrewRecord {
  return {
    id: `brew-${String(n).padStart(2, "0")}`,
    completedAt: new Date(Date.UTC(2026, 9, 4, 9, n % 60)).toISOString(),
    mode: "live",
    recipe,
    elapsedMs: 180_000,
    pouredGrams: 250,
    samples: [
      { atMs: 0, grams: 0 },
      { atMs: 1000, grams: 50, segment: 1 },
    ],
    ...extra,
  };
}
const stored = (storage: ReturnType<typeof memoryStorage>) =>
  JSON.parse(storage.values.get(KEY) ?? "null");
describe("brew history storage", () => {
  it("round-trips brews newest first", () => {
    const storage = memoryStorage();
    const history = createBrewHistory(() => storage);
    expect(history.load()).toEqual([]);
    history.add(record(1));
    history.add(record(2, { mode: "timer", pouredGrams: null }));
    expect(history.load()).toEqual([
      record(2, { mode: "timer", pouredGrams: null }),
      record(1),
    ]);
    expect(stored(storage)).toEqual({
      brews: [record(2, { mode: "timer", pouredGrams: null }), record(1)],
    });
  });
  it("keeps only the newest brews up to the limit", () => {
    const storage = memoryStorage();
    const history = createBrewHistory(() => storage);
    for (let n = 1; n <= HISTORY_LIMIT + 1; n++) history.add(record(n));
    const ids = history.load().map((item) => item.id);
    expect(ids).toHaveLength(HISTORY_LIMIT);
    expect(ids[0]).toBe(record(HISTORY_LIMIT + 1).id);
    expect(ids.at(-1)).toBe(record(2).id);
  });
  it("replaces a brew added again with the same id", () => {
    const storage = memoryStorage();
    const history = createBrewHistory(() => storage);
    history.add(record(1));
    history.add(record(2));
    history.add(record(1, { pouredGrams: 240 }));
    expect(history.load()).toEqual([
      record(1, { pouredGrams: 240 }),
      record(2),
    ]);
  });
  it("removes a known brew and ignores an unknown id", () => {
    const storage = memoryStorage();
    const history = createBrewHistory(() => storage);
    history.add(record(1));
    history.add(record(2));
    history.remove(record(1).id);
    expect(history.load()).toEqual([record(2)]);
    history.remove("missing");
    expect(history.load()).toEqual([record(2)]);
    expect(stored(storage)).toEqual({ brews: [record(2)] });
    history.remove(record(2).id);
    expect(history.load()).toEqual([]);
    expect(stored(storage)).toEqual({ brews: [] });
  });
  it("clears by removing the key, or by saving nothing when that fails", () => {
    const storage = memoryStorage();
    const history = createBrewHistory(() => storage);
    history.add(record(1));
    history.clear();
    expect(storage.values.has(KEY)).toBe(false);
    expect(history.load()).toEqual([]);
    const stuck = memoryStorage();
    const stuckHistory = createBrewHistory(() => ({
      ...stuck,
      removeItem: () => {
        throw new Error("SecurityError");
      },
    }));
    stuckHistory.add(record(1));
    expect(() => stuckHistory.clear()).not.toThrow();
    expect(stuckHistory.load()).toEqual([]);
  });
  it.each([
    "not json",
    "null",
    "4",
    '"text"',
    "[]",
    "{}",
    '{"brews":{}}',
    '{"brews":"[]"}',
    '{"brews":[1,"a",null,{}]}',
  ])("treats a corrupt value %s as an empty history", (raw) => {
    const storage = memoryStorage();
    storage.values.set(KEY, raw);
    expect(createBrewHistory(() => storage).load()).toEqual([]);
  });
  it("drops corrupt brews one by one and strips unknown fields", () => {
    const storage = memoryStorage();
    const good = record(1);
    const later = record(2);
    storage.values.set(
      KEY,
      JSON.stringify({
        brews: [
          { ...good, extra: true, recipe: { ...good.recipe, extra: 1 } },
          { ...record(3), recipe: { ...recipe, doseGrams: -1 } },
          { ...record(4), recipe: { ...recipe, steps: [] } },
          { ...record(5), recipe: { ...recipe, author: 7 } },
          { ...record(6), mode: "manual" },
          { ...record(7), completedAt: "yesterday" },
          { ...record(8), completedAt: 1_700_000_000_000 },
          { ...record(9), samples: [{ atMs: 0, grams: "0" }] },
          { ...record(10), samples: [{ atMs: -1, grams: 0 }] },
          { ...record(11), samples: [{ atMs: 0, grams: 0, segment: null }] },
          { ...record(12), samples: { atMs: 0, grams: 0 } },
          { ...record(13), id: "" },
          { ...record(14), elapsedMs: Number.NaN },
          { ...record(15), pouredGrams: -5 },
          { ...record(16), pouredGrams: undefined },
          later,
          { ...good, pouredGrams: 1 },
        ],
      }),
    );
    expect(createBrewHistory(() => storage).load()).toEqual([good, later]);
  });
  it("drops the oldest brews when storage is over quota", () => {
    const roomy = memoryStorage();
    const seed = createBrewHistory(() => roomy);
    for (let n = 1; n <= 3; n++) seed.add(record(n));
    const threshold = roomy.values.get(KEY)?.length ?? 0;
    const storage = memoryStorage(threshold);
    storage.values.set(KEY, roomy.values.get(KEY) ?? "");
    const history = createBrewHistory(() => storage);
    history.add(record(4));
    expect(history.load()).toEqual([record(4), record(3), record(2)]);
    const tiny = memoryStorage(10);
    tiny.values.set(KEY, JSON.stringify({ brews: [record(1)] }));
    const tinyHistory = createBrewHistory(() => tiny);
    expect(() => tinyHistory.add(record(2))).not.toThrow();
    expect(tinyHistory.load()).toEqual([record(1)]);
  });
  it("tolerates blocked, throwing or missing storage", () => {
    const fail = () => {
      throw new Error("SecurityError");
    };
    for (const storage of [
      fail,
      () => ({ getItem: fail, setItem: fail, removeItem: fail }),
      () => undefined,
    ]) {
      const history = createBrewHistory(storage);
      expect(() => history.add(record(1))).not.toThrow();
      expect(() => history.remove("a")).not.toThrow();
      expect(() => history.clear()).not.toThrow();
      expect(history.load()).toEqual([]);
    }
  });
});
