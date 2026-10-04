import type { Recipe, RecipeStep } from "@/core/recipe";

export function formatTime(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
/** Swirls and spoon stirs move the dripper, so scale readings during them are hidden. */
export function movesDripper(step: RecipeStep) {
  return step.action === "swirl" || step.action === "stir";
}
/** Water target for a step, rounded to whole grams for display. */
export function stepTargetGrams(step: RecipeStep, recipe: Recipe) {
  return Math.round(step.targetFraction * recipe.waterGrams);
}
/** The instruction for a step; pours add their scaled water target to the label. */
export function stepTitle(step: RecipeStep, recipe: Recipe) {
  return step.action === "pour"
    ? `${step.label} to ${stepTargetGrams(step, recipe)} g`
    : step.label;
}
/** Step position, prefixed by the recipe stage when the step has one. */
export function stepEyebrow(step: RecipeStep, recipe: Recipe) {
  const position = `Step ${recipe.steps.indexOf(step) + 1} of ${recipe.steps.length}`;
  return step.stage ? `${step.stage} · ${position}` : position;
}
/** Water for a dose at the recipe's ratio, as whole grams. */
export function waterForDose(recipe: Recipe, dose: number) {
  return Math.round((dose * recipe.waterGrams) / recipe.doseGrams);
}
/** The brew ratio as "1:16.67", dropping needless decimals. */
export function formatRatio(recipe: Recipe) {
  const ratio = recipe.waterGrams / recipe.doseGrams;
  return `1:${Number.isInteger(ratio) ? ratio : ratio.toFixed(2)}`;
}
