export interface RecipeStep {
  atMs: number;
  action: "pour" | "swirl" | "wait" | "drawdown";
  label: string;
  targetFraction: number;
}
export interface Recipe {
  id: string;
  name: string;
  doseGrams: number;
  waterGrams: number;
  steps: readonly RecipeStep[];
}
export const recipe: Recipe = {
  id: "hoffmann-better-one-cup",
  name: "Better 1 Cup V60",
  doseGrams: 15,
  waterGrams: 250,
  steps: [
    {
      atMs: 0,
      action: "pour",
      label: "Bloom · pour gently",
      targetFraction: 0.2,
    },
    {
      atMs: 10000,
      action: "swirl",
      label: "Gently swirl",
      targetFraction: 0.2,
    },
    {
      atMs: 15000,
      action: "wait",
      label: "Let the coffee bloom",
      targetFraction: 0.2,
    },
    { atMs: 45000, action: "pour", label: "Second pour", targetFraction: 0.4 },
    { atMs: 60000, action: "wait", label: "Pause", targetFraction: 0.4 },
    { atMs: 70000, action: "pour", label: "Third pour", targetFraction: 0.6 },
    { atMs: 80000, action: "wait", label: "Pause", targetFraction: 0.6 },
    { atMs: 90000, action: "pour", label: "Fourth pour", targetFraction: 0.8 },
    { atMs: 100000, action: "wait", label: "Pause", targetFraction: 0.8 },
    { atMs: 110000, action: "pour", label: "Final pour", targetFraction: 1 },
    { atMs: 120000, action: "swirl", label: "Gently swirl", targetFraction: 1 },
    {
      atMs: 125000,
      action: "drawdown",
      label: "Let the coffee drain",
      targetFraction: 1,
    },
  ],
};
export function validateRecipe(value: Recipe): void {
  if (
    !Number.isFinite(value.doseGrams) ||
    value.doseGrams <= 0 ||
    !Number.isFinite(value.waterGrams) ||
    value.waterGrams <= 0 ||
    !value.steps.length
  )
    throw new Error(
      "Recipe needs positive finite coffee and water amounts and steps.",
    );
  let previousTime = -1;
  let previousFraction = 0;
  for (const step of value.steps) {
    if (
      !Number.isFinite(step.atMs) ||
      step.atMs < 0 ||
      step.atMs <= previousTime ||
      !Number.isFinite(step.targetFraction) ||
      step.targetFraction < previousFraction ||
      step.targetFraction > 1 ||
      (step.action !== "pour" && step.targetFraction !== previousFraction)
    )
      throw new Error(
        "Recipe steps must have ordered times and cumulative fractions from zero to one.",
      );
    previousTime = step.atMs;
    previousFraction = step.targetFraction;
  }
  if (value.steps[0]?.atMs !== 0 || previousFraction !== 1)
    throw new Error(
      "Recipe must begin at zero and reach its full water target.",
    );
  drawdownStartMs(value);
}
/** Brewing can be finished once its single, final drawdown step begins. */
export function drawdownStartMs(value: Recipe): number {
  const last = value.steps.at(-1);
  if (
    last?.action !== "drawdown" ||
    value.steps.filter((step) => step.action === "drawdown").length !== 1
  )
    throw new Error("Recipe must end with its only drawdown step.");
  return last.atMs;
}
export function scaleRecipe(dose: number, source: Recipe = recipe): Recipe {
  validateRecipe(source);
  if (!Number.isFinite(dose) || dose < 10 || dose > 25)
    throw new Error("Choose a coffee dose from 10 to 25 g.");
  return {
    ...source,
    doseGrams: dose,
    waterGrams: (source.waterGrams * dose) / source.doseGrams,
  };
}
export function stepAt(value: Recipe, elapsedMs: number): RecipeStep {
  let selected = value.steps[0];
  if (!selected) throw new Error("Recipe has no steps.");
  for (const step of value.steps) {
    if (elapsedMs < step.atMs) break;
    selected = step;
  }
  return selected;
}
/** Linear guidance, not a measurement or a requirement for constant pour rate. */
export function expectedWeight(value: Recipe, elapsedMs: number): number {
  let previousFraction = 0;
  for (let index = 0; index < value.steps.length; index++) {
    const step = value.steps[index];
    if (!step) continue;
    if (elapsedMs < step.atMs) return previousFraction * value.waterGrams;
    const end = value.steps[index + 1]?.atMs;
    if (step.action === "pour" && end !== undefined && elapsedMs < end) {
      const progress = Math.max(0, (elapsedMs - step.atMs) / (end - step.atMs));
      return (
        (previousFraction +
          (step.targetFraction - previousFraction) * progress) *
        value.waterGrams
      );
    }
    previousFraction = step.targetFraction;
  }
  return value.waterGrams;
}
export function expectedPoints(value: Recipe, endMs: number) {
  const times = new Set([
    0,
    ...value.steps.map((step) => step.atMs),
    Math.max(180000, endMs),
  ]);
  return [...times]
    .toSorted((a, b) => a - b)
    .map((atMs) => ({ atMs, grams: expectedWeight(value, atMs) }));
}
