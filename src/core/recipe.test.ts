import { describe, expect, it } from "vitest";
import {
  drawdownStartMs,
  expectedPoints,
  expectedWeight,
  recipe,
  scaleRecipe,
  stepAt,
  validateRecipe,
} from "./recipe";

describe("Hoffmann recipe guidance", () => {
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
    expect(stepAt(recipe, 45000).label).toBe("Second pour");
    expect(stepAt(recipe, 999999).action).toBe("drawdown");
    expect(expectedPoints(recipe, 200000).at(-1)).toEqual({
      atMs: 200000,
      grams: 250,
    });
  });
  it("scales amounts precisely while preserving timings", () => {
    const scaled = scaleRecipe(18);
    expect(scaled.waterGrams).toBe(300);
    expect(expectedWeight(scaled, 75000)).toBe(150);
    expect(scaled.steps).toBe(recipe.steps);
    expect(scaleRecipe(10).waterGrams).toBeCloseTo(500 / 3);
    expect(scaleRecipe(25).waterGrams).toBeCloseTo(1250 / 3);
  });
  it.each([NaN, Infinity, -Infinity, 0, -1, 9.99, 25.01])(
    "rejects invalid dose %s",
    (dose) => expect(() => scaleRecipe(dose)).toThrow(),
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
    expect(drawdownStartMs(scaleRecipe(20))).toBe(125000);
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
