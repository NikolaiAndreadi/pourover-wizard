export interface RecipeStep {
  atMs: number;
  /** Swirls and spoon stirs move the dripper, so readings during them are unreliable. */
  action: "pour" | "swirl" | "stir" | "wait" | "drawdown";
  /** What to do, as a short imperative phrase. Pour targets are added by the app. */
  label: string;
  targetFraction: number;
  /** Named brewing stage shown alongside the step, such as the bloom. */
  stage?: string;
}
export interface RecipeSource {
  label: string;
  url: string;
}
export interface Recipe {
  id: string;
  /** Recipe name, without the author: attribution without implied endorsement. */
  name: string;
  /** Person credited for the recipe. */
  author: string;
  /** Links to the original recipe. */
  sources: readonly RecipeSource[];
  /** One line about the recipe, such as temperature and grind hints. */
  summary: string;
  doseGrams: number;
  waterGrams: number;
  minDoseGrams: number;
  maxDoseGrams: number;
  /** When the brew typically finishes; guidance for tapping Done, never detected. */
  finishGuideMs: number;
  steps: readonly RecipeStep[];
}
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
  if (
    !Number.isFinite(value.minDoseGrams) ||
    !Number.isFinite(value.maxDoseGrams) ||
    value.minDoseGrams <= 0 ||
    value.minDoseGrams > value.doseGrams ||
    value.maxDoseGrams < value.doseGrams
  )
    throw new Error(
      "Recipe needs a positive finite dose range that contains its dose.",
    );
  if (
    value.author.trim() === "" ||
    !value.sources.length ||
    value.sources.some(
      (source) => source.label.trim() === "" || source.url.trim() === "",
    )
  )
    throw new Error("Recipe needs an author and at least one source link.");
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
  if (
    !Number.isFinite(value.finishGuideMs) ||
    value.finishGuideMs <= drawdownStartMs(value)
  )
    throw new Error("Recipe finish guide must come after drawdown starts.");
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
/** Water for a dose at the recipe's ratio; timings never change. */
export function scaleRecipe(dose: number, source: Recipe): Recipe {
  validateRecipe(source);
  if (
    !Number.isFinite(dose) ||
    dose < source.minDoseGrams ||
    dose > source.maxDoseGrams
  )
    throw new Error(
      `Choose a coffee dose from ${source.minDoseGrams} to ${source.maxDoseGrams} g.`,
    );
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
    Math.max(value.finishGuideMs, endMs),
  ]);
  return [...times]
    .toSorted((a, b) => a - b)
    .map((atMs) => ({ atMs, grams: expectedWeight(value, atMs) }));
}
