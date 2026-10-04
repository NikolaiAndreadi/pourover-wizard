import type { Recipe } from "./recipe";

/**
 * Timings are fixed; targets are cumulative fractions of the water, so the
 * dose picker rescales water while keeping the recipe's clock. Each pour runs
 * until the next step, so short pours are followed by explicit waits.
 */
const betterOneCup: Recipe = {
  id: "hoffmann-better-one-cup",
  name: "Better 1 Cup V60",
  author: "James Hoffmann",
  sources: [
    {
      label: "Watch the original",
      url: "https://www.youtube.com/watch?v=1oB1oDrDkHM",
    },
    {
      label: "Hario’s guide",
      url: "https://www.hario-usa.com/blogs/recipes-and-more-from-friends/james-hoffmann-1-cup-v60-technique",
    },
  ],
  summary:
    "Five pours of 50 g, swirls after the bloom and the last pour; just-off-boil water, medium-fine grind.",
  doseGrams: 15,
  waterGrams: 250,
  minDoseGrams: 10,
  maxDoseGrams: 25,
  finishGuideMs: 180000,
  steps: [
    {
      atMs: 0,
      action: "pour",
      label: "Pour",
      targetFraction: 0.2,
      stage: "Bloom",
    },
    {
      atMs: 10000,
      action: "swirl",
      label: "Swirl gently",
      targetFraction: 0.2,
      stage: "Bloom",
    },
    {
      atMs: 15000,
      action: "wait",
      label: "Let it bloom",
      targetFraction: 0.2,
      stage: "Bloom",
    },
    { atMs: 45000, action: "pour", label: "Pour", targetFraction: 0.4 },
    { atMs: 60000, action: "wait", label: "Wait", targetFraction: 0.4 },
    { atMs: 70000, action: "pour", label: "Pour", targetFraction: 0.6 },
    { atMs: 80000, action: "wait", label: "Wait", targetFraction: 0.6 },
    { atMs: 90000, action: "pour", label: "Pour", targetFraction: 0.8 },
    { atMs: 100000, action: "wait", label: "Wait", targetFraction: 0.8 },
    { atMs: 110000, action: "pour", label: "Pour", targetFraction: 1 },
    { atMs: 120000, action: "swirl", label: "Swirl gently", targetFraction: 1 },
    {
      atMs: 125000,
      action: "drawdown",
      label: "Let it drain",
      targetFraction: 1,
      stage: "Drawdown",
    },
  ],
};
const ultimate: Recipe = {
  id: "hoffmann-ultimate",
  name: "Ultimate V60",
  author: "James Hoffmann",
  sources: [
    {
      label: "Watch the original",
      url: "https://www.youtube.com/watch?v=AI4ynXzkSQo",
    },
    {
      label: "Hario’s guide",
      url: "https://www.hario-usa.com/blogs/recipes-and-more-from-friends/james-hoffmann-uitimate-v60-technique",
    },
  ],
  summary:
    "Bloom with twice the coffee weight, two 30 s pours, a spoon stir and a swirl; hot water for light roasts, medium-fine grind.",
  doseGrams: 30,
  waterGrams: 500,
  minDoseGrams: 20,
  maxDoseGrams: 40,
  finishGuideMs: 210000,
  steps: [
    {
      atMs: 0,
      action: "pour",
      label: "Pour",
      targetFraction: 0.12,
      stage: "Bloom",
    },
    {
      atMs: 10000,
      action: "swirl",
      label: "Swirl gently",
      targetFraction: 0.12,
      stage: "Bloom",
    },
    {
      atMs: 15000,
      action: "wait",
      label: "Let it bloom",
      targetFraction: 0.12,
      stage: "Bloom",
    },
    { atMs: 45000, action: "pour", label: "Pour", targetFraction: 0.6 },
    { atMs: 75000, action: "pour", label: "Pour", targetFraction: 1 },
    {
      atMs: 105000,
      action: "stir",
      label: "Stir once each way",
      targetFraction: 1,
    },
    {
      atMs: 110000,
      action: "wait",
      label: "Let it drain a little",
      targetFraction: 1,
    },
    { atMs: 120000, action: "swirl", label: "Swirl gently", targetFraction: 1 },
    {
      atMs: 125000,
      action: "drawdown",
      label: "Let it drain",
      targetFraction: 1,
      stage: "Drawdown",
    },
  ],
};
const fourSix: Recipe = {
  id: "kasuya-four-six",
  name: "4:6 Method",
  author: "Tetsu Kasuya",
  sources: [
    {
      label: "Philocoffea’s guide",
      url: "https://en.philocoffea.com/blogs/blog/coffee-brewing-method",
    },
  ],
  summary:
    "Five equal pours at 1:15; the first two set sweetness, the last three strength. Coarser grind, 83–93 °C by roast.",
  doseGrams: 20,
  waterGrams: 300,
  minDoseGrams: 15,
  maxDoseGrams: 30,
  finishGuideMs: 210000,
  steps: [
    {
      atMs: 0,
      action: "pour",
      label: "Pour",
      targetFraction: 0.2,
      stage: "Sweetness",
    },
    {
      atMs: 10000,
      action: "wait",
      label: "Wait",
      targetFraction: 0.2,
      stage: "Sweetness",
    },
    {
      atMs: 45000,
      action: "pour",
      label: "Pour",
      targetFraction: 0.4,
      stage: "Sweetness",
    },
    {
      atMs: 55000,
      action: "wait",
      label: "Wait",
      targetFraction: 0.4,
      stage: "Sweetness",
    },
    {
      atMs: 90000,
      action: "pour",
      label: "Pour",
      targetFraction: 0.6,
      stage: "Strength",
    },
    {
      atMs: 100000,
      action: "wait",
      label: "Wait",
      targetFraction: 0.6,
      stage: "Strength",
    },
    {
      atMs: 135000,
      action: "pour",
      label: "Pour",
      targetFraction: 0.8,
      stage: "Strength",
    },
    {
      atMs: 145000,
      action: "wait",
      label: "Wait",
      targetFraction: 0.8,
      stage: "Strength",
    },
    {
      atMs: 165000,
      action: "pour",
      label: "Pour",
      targetFraction: 1,
      stage: "Strength",
    },
    {
      atMs: 175000,
      action: "drawdown",
      label: "Let it drain, then remove the dripper",
      targetFraction: 1,
      stage: "Drawdown",
    },
  ],
};
/** Recipes in picker order; the first is the default. */
export const recipes: readonly Recipe[] = [betterOneCup, ultimate, fourSix];
/** The Better 1 Cup recipe, the app's default. */
export const recipe: Recipe = betterOneCup;
export function recipeById(id: string): Recipe {
  const found = recipes.find((value) => value.id === id);
  if (!found) throw new Error(`Unknown recipe: ${id}`);
  return found;
}
