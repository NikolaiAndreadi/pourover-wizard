import { expect, it } from "vitest";
import { fakeSample } from "./fake";

it("uses reproducible synthetic readings with independent checkpoint oracle", () => {
  expect(fakeSample(0, null, 250, 42)).toEqual({ atMs: 0, grams: 0 });
  expect(fakeSample(5000, 0, 250, 42)).toEqual(fakeSample(5000, 0, 250, 42));
  expect(fakeSample(5000, 0, 250, 42).grams).toBeCloseTo(25, 0);
  expect(fakeSample(120000, 0, 250, 42).grams).toBeCloseTo(250, 0);
  expect(fakeSample(75000, 0, 300, 42).grams).toBeCloseTo(150, 0);
  expect(fakeSample(5000, 0, 250, 42)).not.toEqual(
    fakeSample(5000, 0, 250, 43),
  );
});
