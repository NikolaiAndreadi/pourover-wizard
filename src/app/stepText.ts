import type { Recipe, RecipeStep } from "@/core/recipe";

/** About when drawdown usually finishes; guidance only, never detected. */
export const DRAWDOWN_GUIDE_MS = 180000;

export function formatTime(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
/** Water target for a step, rounded to whole grams for display. */
export function stepTargetGrams(step: RecipeStep, recipe: Recipe) {
  return Math.round(step.targetFraction * recipe.waterGrams);
}
/** The instruction for a step; pours name their scaled water target. */
export function stepTitle(step: RecipeStep, recipe: Recipe) {
  return step.action === "pour"
    ? `Pour to ${stepTargetGrams(step, recipe)} g`
    : step.label;
}
/** Step position, prefixed by the recipe stage when the step has one. */
export function stepEyebrow(step: RecipeStep, recipe: Recipe) {
  const position = `Step ${recipe.steps.indexOf(step) + 1} of ${recipe.steps.length}`;
  return step.stage ? `${step.stage} · ${position}` : position;
}
