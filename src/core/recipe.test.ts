import { describe, expect, it } from "vitest";
import {
  drawdownStartMs,
  expectedPoints,
  expectedWeight,
  scaleRecipe,
  stepAt,
  validateRecipe,
} from "./recipe";
import { recipe, recipeById, recipes } from "./recipes";

describe("Hoffmann recipe guidance", () => {
  it("rejects blank step hints", () => {
    const [first, ...rest] = recipe.steps;
    if (!first) throw new Error("recipe has steps");
    expect(() =>
      validateRecipe({ ...recipe, steps: [{ ...first, hint: " " }, ...rest] }),
    ).toThrow("hints");
  });
  it("matches independent source timing and target checkpoints", () => {
    expect(recipe.steps.map((step) => step.atMs)).toEqual([
      0, 10000, 15000, 45000, 60000, 70000, 80000, 90000, 100000, 110000,
      120000, 125000,
    ]);
    for (const [at, grams] of [
      [-1, 0],
      [0, 0],
      [5000, 25],
      [10000, 50],
      [44999, 50],
      [45000, 50],
      [52500, 75],
      [60000, 100],
      [70000, 100],
      [75000, 125],
      [80000, 150],
      [95000, 175],
      [100000, 200],
      [115000, 225],
      [120000, 250],
      [999999, 250],
    ]) {
      expect(expectedWeight(recipe, at ?? 0)).toBeCloseTo(grams ?? 0);
    }
    expect(stepAt(recipe, 44999).action).toBe("wait");
    expect(stepAt(recipe, 45000)).toBe(recipe.steps[3]);
    expect(stepAt(recipe, 999999).action).toBe("drawdown");
    expect(expectedPoints(recipe, 200000).at(-1)).toEqual({
      atMs: 200000,
      grams: 250,
    });
  });
  it("scales amounts precisely while preserving timings", () => {
    const scaled = scaleRecipe(18, recipe);
    expect(scaled.waterGrams).toBe(300);
    expect(expectedWeight(scaled, 75000)).toBe(150);
    expect(scaled.steps).toBe(recipe.steps);
    expect(scaleRecipe(10, recipe).waterGrams).toBeCloseTo(500 / 3);
    expect(scaleRecipe(25, recipe).waterGrams).toBeCloseTo(1250 / 3);
  });
  it.each([NaN, Infinity, -Infinity, 0, -1, 9.99, 25.01])(
    "rejects invalid dose %s",
    (dose) => expect(() => scaleRecipe(dose, recipe)).toThrow(),
  );
  it("rejects malformed recipes", () => {
    for (const patch of [
      { doseGrams: 0 },
      { waterGrams: Infinity },
      { steps: [] },
      { steps: [{ ...recipe.steps[0]!, atMs: 1 }] },
      { steps: [{ ...recipe.steps[0]!, targetFraction: NaN }] },
      { steps: [{ ...recipe.steps[0]!, targetFraction: -1 }] },
      { steps: [{ ...recipe.steps[0]!, targetFraction: 1.1 }] },
      { steps: [recipe.steps[0]!, { ...recipe.steps[1]!, atMs: 0 }] },
      {
        steps: [
          { ...recipe.steps[0]!, targetFraction: 0.8 },
          { ...recipe.steps[1]!, targetFraction: 0.5 },
        ],
      },
    ])
      expect(() => validateRecipe({ ...recipe, ...patch })).toThrow();
    expect(() => stepAt({ ...recipe, steps: [] }, 0)).toThrow();
  });
});
it("does not allow water target changes during non-pour actions", () => {
  expect(() =>
    validateRecipe({
      ...recipe,
      steps: [
        recipe.steps[0]!,
        { atMs: 1000, action: "wait", label: "wait", targetFraction: 1 },
      ],
    }),
  ).toThrow(/cumulative fractions/);
});
describe("independent recipe validation failures", () => {
  it.each([0, -1, NaN, Infinity])(
    "rejects invalid water %s with otherwise complete valid steps",
    (waterGrams) => {
      expect(() => validateRecipe({ ...recipe, waterGrams })).toThrow(
        /positive finite/,
      );
      expect(() => scaleRecipe(18, { ...recipe, waterGrams })).toThrow(
        /positive finite/,
      );
    },
  );
  it.each([0, -1, NaN, Infinity])(
    "rejects invalid recipe dose %s independently of chosen dose",
    (doseGrams) => {
      expect(() => scaleRecipe(18, { ...recipe, doseGrams })).toThrow(
        /positive finite/,
      );
    },
  );
  it.each([NaN, Infinity, -1, 15000])(
    "rejects a malformed middle timestamp %s in a complete recipe",
    (atMs) => {
      const steps = recipe.steps.map((step, index) =>
        index === 3 ? { ...step, atMs } : step,
      );
      expect(() => validateRecipe({ ...recipe, steps })).toThrow(
        /ordered times/,
      );
    },
  );
  it("rejects decreasing cumulative fractions without relying on final-target validation", () => {
    const steps = recipe.steps.map((step, index) =>
      index === 3 || index === 4 ? { ...step, targetFraction: 0.1 } : step,
    );
    expect(() => validateRecipe({ ...recipe, steps })).toThrow(
      /cumulative fractions/,
    );
  });
  it.each([NaN, 1.1])(
    "reports invalid cumulative fraction %s at its step rather than only the final target",
    (targetFraction) => {
      const steps = recipe.steps.map((step, index) =>
        index === 9 ? { ...step, targetFraction } : step,
      );
      expect(() => validateRecipe({ ...recipe, steps })).toThrow(
        /cumulative fractions/,
      );
    },
  );
  it("requires zero origin and a complete water target independently of ordered steps", () => {
    const shifted = recipe.steps.map((step) => ({
      ...step,
      atMs: step.atMs + 1,
    }));
    expect(() => validateRecipe({ ...recipe, steps: shifted })).toThrow(
      /begin at zero/,
    );
    const incomplete = recipe.steps.map((step) => ({
      ...step,
      targetFraction: step.targetFraction * 0.9,
    }));
    expect(() => validateRecipe({ ...recipe, steps: incomplete })).toThrow(
      /full water target/,
    );
  });
});
describe("drawdown start", () => {
  it("is the final drawdown step time for original and scaled recipes", () => {
    expect(drawdownStartMs(recipe)).toBe(125000);
    expect(drawdownStartMs(scaleRecipe(20, recipe))).toBe(125000);
    const later = recipe.steps.map((step, index, all) =>
      index === all.length - 1 ? { ...step, atMs: 130000 } : step,
    );
    expect(drawdownStartMs({ ...recipe, steps: later })).toBe(130000);
  });
  it.each([
    ["no drawdown", recipe.steps.slice(0, -1)],
    [
      "two drawdowns",
      recipe.steps.map((step, index) =>
        index === 10 ? { ...step, action: "drawdown" as const } : step,
      ),
    ],
    [
      "a drawdown before the final step",
      recipe.steps.map((step, index, all) =>
        index === 10
          ? { ...step, action: "drawdown" as const }
          : index === all.length - 1
            ? { ...step, action: "wait" as const }
            : step,
      ),
    ],
  ])("rejects a recipe with %s", (_, steps) => {
    expect(() => drawdownStartMs({ ...recipe, steps })).toThrow(/drawdown/);
    expect(() => validateRecipe({ ...recipe, steps })).toThrow(/drawdown/);
  });
});
describe("recipe catalogue", () => {
  const ultimate = recipeById("hoffmann-ultimate");
  const fourSix = recipeById("kasuya-four-six");
  it("lists valid recipes with unique ids and names free of author names", () => {
    expect(recipes.map((value) => value.id)).toEqual([
      "hoffmann-better-one-cup",
      "hoffmann-ultimate",
      "kasuya-four-six",
    ]);
    expect(recipes[0]).toBe(recipe);
    for (const value of recipes) {
      expect(() => validateRecipe(value)).not.toThrow();
      for (const part of value.author.split(" "))
        expect(value.name).not.toContain(part);
      expect(value.sources.length).toBeGreaterThan(0);
      expect(value.summary.trim()).not.toBe("");
    }
  });
  it("finds recipes by id and rejects unknown ids", () => {
    expect(recipeById("hoffmann-better-one-cup")).toBe(recipe);
    expect(ultimate.name).toBe("Ultimate V60");
    expect(fourSix.author).toBe("Tetsu Kasuya");
    expect(() => recipeById("rao")).toThrow(/Unknown recipe: rao/);
  });
  it("matches the Ultimate V60 source: 60 g bloom, 300 g by 1:15, 500 g by 1:45, finish by 3:30", () => {
    expect(ultimate.doseGrams).toBe(30);
    expect(ultimate.waterGrams).toBe(500);
    expect(ultimate.steps.map((step) => step.atMs)).toEqual([
      0, 10000, 15000, 45000, 75000, 105000, 110000, 120000, 125000,
    ]);
    expect(ultimate.steps.map((step) => step.action)).toEqual([
      "pour",
      "swirl",
      "wait",
      "pour",
      "pour",
      "stir",
      "wait",
      "swirl",
      "drawdown",
    ]);
    for (const [at, grams] of [
      [0, 0],
      [5000, 30],
      [10000, 60],
      [44999, 60],
      [60000, 180],
      [75000, 300],
      [90000, 400],
      [105000, 500],
      [999999, 500],
    ])
      expect(expectedWeight(ultimate, at ?? 0)).toBeCloseTo(grams ?? 0);
    expect(drawdownStartMs(ultimate)).toBe(125000);
    expect(ultimate.finishGuideMs).toBe(210000);
    expect(expectedPoints(ultimate, 100000).at(-1)).toEqual({
      atMs: 210000,
      grams: 500,
    });
  });
  it("matches the 4:6 source: five 60 g pours at 0:00, 0:45, 1:30, 2:15 and 2:45, dripper off at 3:30", () => {
    expect(fourSix.doseGrams).toBe(20);
    expect(fourSix.waterGrams).toBe(300);
    expect(
      fourSix.steps
        .filter((step) => step.action === "pour")
        .map((step) => [step.atMs, step.targetFraction * fourSix.waterGrams]),
    ).toEqual([
      [0, 60],
      [45000, 120],
      [90000, 180],
      [135000, 240],
      [165000, 300],
    ]);
    for (const [at, grams] of [
      [5000, 30],
      [10000, 60],
      [44999, 60],
      [50000, 90],
      [55000, 120],
      [95000, 150],
      [100000, 180],
      [140000, 210],
      [145000, 240],
      [170000, 270],
      [175000, 300],
      [999999, 300],
    ])
      expect(expectedWeight(fourSix, at ?? 0)).toBeCloseTo(grams ?? 0);
    expect(stepAt(fourSix, 44999).stage).toBe("Sweetness");
    expect(stepAt(fourSix, 90000).stage).toBe("Strength");
    expect(drawdownStartMs(fourSix)).toBe(175000);
    expect(fourSix.finishGuideMs).toBe(210000);
  });
  it.each(recipes)("scales $name only within its own dose range", (value) => {
    const range = new RegExp(
      `from ${value.minDoseGrams} to ${value.maxDoseGrams} g`,
    );
    expect(scaleRecipe(value.minDoseGrams, value).waterGrams).toBeCloseTo(
      (value.waterGrams * value.minDoseGrams) / value.doseGrams,
    );
    expect(scaleRecipe(value.maxDoseGrams, value).steps).toBe(value.steps);
    expect(() => scaleRecipe(value.minDoseGrams - 0.01, value)).toThrow(range);
    expect(() => scaleRecipe(value.maxDoseGrams + 0.01, value)).toThrow(range);
  });
  it("rejects malformed dose ranges, credits and finish guides", () => {
    for (const patch of [
      { minDoseGrams: 0 },
      { minDoseGrams: NaN },
      { minDoseGrams: 15.01 },
      { maxDoseGrams: 14.99 },
      { maxDoseGrams: Infinity },
    ])
      expect(() => validateRecipe({ ...recipe, ...patch })).toThrow(
        /dose range/,
      );
    for (const patch of [
      { author: " " },
      { sources: [] },
      { sources: [{ label: "", url: "https://example.test" }] },
      { sources: [{ label: "Source", url: " " }] },
    ])
      expect(() => validateRecipe({ ...recipe, ...patch })).toThrow(
        /author and at least one source/,
      );
    for (const finishGuideMs of [NaN, Infinity, 125000, 0])
      expect(() => validateRecipe({ ...recipe, finishGuideMs })).toThrow(
        /finish guide/,
      );
    expect(
      expectedPoints({ ...recipe, finishGuideMs: 200000 }, 0).at(-1),
    ).toEqual({ atMs: 200000, grams: 250 });
  });
});
