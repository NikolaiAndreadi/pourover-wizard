import { describe, expect, it } from "vitest";
import { scaleRecipe } from "@/core/recipe";
import { recipe, recipeById } from "@/core/recipes";
import {
  formatRatio,
  formatTime,
  movesDripper,
  stepEyebrow,
  stepTitle,
  waterForDose,
} from "./stepText";

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
    const scaled = scaleRecipe(18, recipe);
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
  it("names stirs by their label and numbers them within the recipe", () => {
    const ultimate = recipeById("hoffmann-ultimate");
    const stir = ultimate.steps.find((step) => step.action === "stir");
    expect(stir && stepTitle(stir, ultimate)).toBe("Stir once each way");
    expect(stir && stepEyebrow(stir, ultimate)).toBe("Step 6 of 9");
    expect(ultimate.steps.map(movesDripper)).toEqual([
      false,
      true,
      false,
      false,
      false,
      true,
      false,
      true,
      false,
    ]);
  });
  it("derives home-screen water and ratio text from the recipe", () => {
    expect(waterForDose(recipe, 15)).toBe(250);
    expect(waterForDose(recipe, 18)).toBe(300);
    expect(waterForDose(recipeById("kasuya-four-six"), 15)).toBe(225);
    expect(formatRatio(recipe)).toBe("1:16.67");
    expect(formatRatio(recipeById("kasuya-four-six"))).toBe("1:15");
  });
});
