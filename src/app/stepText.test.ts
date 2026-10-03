import { describe, expect, it } from "vitest";
import { recipe, scaleRecipe } from "@/core/recipe";
import { formatTime, stepEyebrow, stepTitle } from "./stepText";

describe("step instructions", () => {
  it("names every original step by what to do, with pour targets in grams", () => {
    expect(recipe.steps.map((step) => stepTitle(step, recipe))).toEqual([
      "Pour to 50 g",
      "Swirl gently",
      "Let it bloom",
      "Pour to 100 g",
      "Wait",
      "Pour to 150 g",
      "Wait",
      "Pour to 200 g",
      "Wait",
      "Pour to 250 g",
      "Swirl gently",
      "Let it drain",
    ]);
  });
  it("scales pour targets with the dose", () => {
    const scaled = scaleRecipe(18);
    expect(
      scaled.steps
        .filter((step) => step.action === "pour")
        .map((step) => stepTitle(step, scaled)),
    ).toEqual([
      "Pour to 60 g",
      "Pour to 120 g",
      "Pour to 180 g",
      "Pour to 240 g",
      "Pour to 300 g",
    ]);
  });
  it("labels bloom and drawdown stages and numbers the rest", () => {
    const [first, , , fourth] = recipe.steps;
    expect(first && stepEyebrow(first, recipe)).toBe("Bloom · Step 1 of 12");
    expect(fourth && stepEyebrow(fourth, recipe)).toBe("Step 4 of 12");
    const last = recipe.steps.at(-1);
    expect(last && stepEyebrow(last, recipe)).toBe("Drawdown · Step 12 of 12");
  });
  it("formats whole elapsed seconds and never shows negative time", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(7999)).toBe("0:07");
    expect(formatTime(125000)).toBe("2:05");
    expect(formatTime(-500)).toBe("0:00");
  });
});
