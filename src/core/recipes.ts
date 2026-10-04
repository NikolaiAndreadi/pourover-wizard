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
      hint: "Wet all the grounds evenly; 50 g is twice the coffee.",
      targetFraction: 0.2,
      stage: "Bloom",
    },
    {
      atMs: 10000,
      action: "swirl",
      label: "Swirl gently",
      hint: "Gentle swirl until the bed is flat; readings pause while it moves.",
      targetFraction: 0.2,
      stage: "Bloom",
    },
    {
      atMs: 15000,
      action: "wait",
      label: "Let it bloom",
      hint: "Let gas escape; keep the kettle hot.",
      targetFraction: 0.2,
      stage: "Bloom",
    },
    {
      atMs: 45000,
      action: "pour",
      label: "Pour",
      targetFraction: 0.4,
      hint: "Slow circles; the line rises evenly to the target.",
    },
    {
      atMs: 60000,
      action: "wait",
      label: "Wait",
      targetFraction: 0.4,
      hint: "Let the level drop a little before the next pour.",
    },
    {
      atMs: 70000,
      action: "pour",
      label: "Pour",
      targetFraction: 0.6,
      hint: "Pour steadily to the target by the end of the step.",
    },
    { atMs: 80000, action: "wait", label: "Wait", targetFraction: 0.6 },
    {
      atMs: 90000,
      action: "pour",
      label: "Pour",
      targetFraction: 0.8,
      hint: "Keep the same gentle pace.",
    },
    { atMs: 100000, action: "wait", label: "Wait", targetFraction: 0.8 },
    {
      atMs: 110000,
      action: "pour",
      label: "Pour",
      targetFraction: 1,
      hint: "Land on the full water as the step ends.",
    },
    {
      atMs: 120000,
      action: "swirl",
      label: "Swirl gently",
      targetFraction: 1,
      hint: "A last swirl flattens the bed for an even drawdown.",
    },
    {
      atMs: 125000,
      action: "drawdown",
      label: "Let it drain",
      hint: "Tap Done when dripping stops; about 3:00 is typical.",
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
      hint: "60 g bloom, twice the coffee; wet everything.",
      targetFraction: 0.12,
      stage: "Bloom",
    },
    {
      atMs: 10000,
      action: "swirl",
      label: "Swirl gently",
      hint: "Gentle swirl until the bed is flat; readings pause while it moves.",
      targetFraction: 0.12,
      stage: "Bloom",
    },
    {
      atMs: 15000,
      action: "wait",
      label: "Let it bloom",
      hint: "Bloom for the full 45 s.",
      targetFraction: 0.12,
      stage: "Bloom",
    },
    {
      atMs: 45000,
      action: "pour",
      label: "Pour",
      targetFraction: 0.6,
      hint: "Pour to 60% of the water over 30 s, in circles.",
    },
    {
      atMs: 75000,
      action: "pour",
      label: "Pour",
      targetFraction: 1,
      hint: "Finish the water a little slower, also over 30 s.",
    },
    {
      atMs: 105000,
      action: "stir",
      label: "Stir once each way",
      hint: "One turn each way with a spoon to knock grounds off the wall.",
      targetFraction: 1,
    },
    {
      atMs: 110000,
      action: "wait",
      label: "Let it drain a little",
      hint: "Let it drain a little before the swirl.",
      targetFraction: 1,
    },
    {
      atMs: 120000,
      action: "swirl",
      label: "Swirl gently",
      targetFraction: 1,
      hint: "A gentle swirl flattens the bed.",
    },
    {
      atMs: 125000,
      action: "drawdown",
      label: "Let it drain",
      hint: "Aim to finish by 3:30; tap Done when dripping stops.",
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
      hint: "The first 40% sets sweetness; more here tastes brighter.",
      targetFraction: 0.2,
      stage: "Sweetness",
    },
    {
      atMs: 10000,
      action: "wait",
      label: "Wait",
      hint: "Let it drain almost fully before the next pour.",
      targetFraction: 0.2,
      stage: "Sweetness",
    },
    {
      atMs: 45000,
      action: "pour",
      label: "Pour",
      hint: "Second pour completes the sweetness 40%.",
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
      hint: "The last 60% sets strength; three pours here is standard.",
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
      hint: "Keep the pour gentle; let it drain between pours.",
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
      hint: "Last pour; the dripper comes off at 3:30.",
      targetFraction: 1,
      stage: "Strength",
    },
    {
      atMs: 175000,
      action: "drawdown",
      label: "Let it drain, then remove the dripper",
      hint: "Remove the dripper at 3:30 even if water remains.",
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
