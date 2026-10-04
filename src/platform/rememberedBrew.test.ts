import { describe, expect, it } from "vitest";
import { createRememberedBrew } from "./rememberedBrew";

const KEY = "pourover-wizard.brew";
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
describe("remembered brew storage", () => {
  it("round-trips the chosen recipe and a dose per recipe", () => {
    const storage = memoryStorage();
    const remembered = createRememberedBrew(() => storage);
    expect(remembered.load()).toEqual({ doses: {} });
    remembered.saveRecipe("kasuya-4-6");
    expect(remembered.load()).toEqual({ recipeId: "kasuya-4-6", doses: {} });
    remembered.saveDose("kasuya-4-6", 22);
    remembered.saveDose("hoffmann-better-one-cup", 12.5);
    remembered.saveRecipe("hoffmann-better-one-cup");
    expect(remembered.load()).toEqual({
      recipeId: "hoffmann-better-one-cup",
      doses: { "kasuya-4-6": 22, "hoffmann-better-one-cup": 12.5 },
    });
    remembered.saveDose("kasuya-4-6", 18);
    expect(remembered.load().doses["kasuya-4-6"]).toBe(18);
    expect(JSON.parse(storage.values.get(KEY) ?? "")).toEqual({
      recipeId: "hoffmann-better-one-cup",
      doses: { "kasuya-4-6": 18, "hoffmann-better-one-cup": 12.5 },
    });
  });
  it.each(["not json", "null", "4", '"text"', "[]", "{}", '{"recipeId":""}'])(
    "treats a corrupt value %s as nothing remembered",
    (raw) => {
      const storage = memoryStorage();
      storage.values.set(KEY, raw);
      expect(createRememberedBrew(() => storage).load()).toEqual({ doses: {} });
    },
  );
  it("drops a non-string recipe id and keeps only finite positive doses", () => {
    const storage = memoryStorage();
    storage.values.set(
      KEY,
      JSON.stringify({
        recipeId: 7,
        doses: {
          a: 20,
          b: "20",
          c: -1,
          d: 0,
          e: null,
          f: Number.POSITIVE_INFINITY,
        },
      }),
    );
    expect(createRememberedBrew(() => storage).load()).toEqual({
      doses: { a: 20 },
    });
    storage.values.set(KEY, '{"recipeId":"a","doses":[]}');
    expect(createRememberedBrew(() => storage).load()).toEqual({
      recipeId: "a",
      doses: {},
    });
    storage.values.set(KEY, '{"recipeId":"a","doses":"20"}');
    expect(createRememberedBrew(() => storage).load()).toEqual({
      recipeId: "a",
      doses: {},
    });
  });
  it("tolerates blocked, throwing or missing storage", () => {
    const fail = () => {
      throw new Error("SecurityError");
    };
    for (const storage of [
      fail,
      () => ({ getItem: fail, setItem: fail }),
      () => undefined,
    ]) {
      const remembered = createRememberedBrew(storage);
      expect(() => remembered.saveRecipe("a")).not.toThrow();
      expect(() => remembered.saveDose("a", 20)).not.toThrow();
      expect(remembered.load()).toEqual({ doses: {} });
    }
  });
  it("keeps the recipe when only writing fails", () => {
    const storage = memoryStorage();
    storage.values.set(KEY, '{"recipeId":"a","doses":{"a":20}}');
    const remembered = createRememberedBrew(() => ({
      getItem: storage.getItem,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    }));
    expect(() => remembered.saveDose("a", 25)).not.toThrow();
    expect(remembered.load()).toEqual({ recipeId: "a", doses: { a: 20 } });
  });
});
