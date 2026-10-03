import { describe, expect, it } from "vitest";
import type { ScaleSample } from "@/core/scale";
import { displayWeight, pushDisplayReading } from "./useLiveScale";

function buffer(readings: [number, number][]) {
  let values: ScaleSample[] = [];
  for (const [atMs, grams] of readings)
    values = pushDisplayReading(values, { atMs, grams });
  return values;
}

describe("live display smoothing", () => {
  it("keeps at most five readings from the last half-second", () => {
    expect(
      buffer([
        [0, 1],
        [100, 2],
        [200, 3],
        [300, 4],
        [400, 5],
        [500, 6],
      ]).map((value) => value.grams),
    ).toEqual([2, 3, 4, 5, 6]);
    expect(
      buffer([
        [0, 1],
        [500, 2],
        [501, 3],
      ]).map((value) => value.atMs),
    ).toEqual([500, 501]);
  });
  it("shows the median, falls back to the latest reading and never goes below zero", () => {
    const latest = { atMs: 0, grams: 7 };
    expect(displayWeight([], null)).toBeNull();
    expect(displayWeight([], latest)).toBe(7);
    expect(displayWeight([], { atMs: 0, grams: -12.2 })).toBe(0);
    expect(
      displayWeight(
        buffer([
          [0, 10],
          [100, 999],
          [200, 11],
        ]),
        latest,
      ),
    ).toBe(11);
    expect(
      displayWeight(
        buffer([
          [0, 4],
          [100, 1],
          [200, 3],
          [300, 2],
        ]),
        latest,
      ),
    ).toBe(3);
    expect(
      displayWeight(
        buffer([
          [0, -3],
          [100, -2],
          [200, -1],
        ]),
        latest,
      ),
    ).toBe(0);
  });
});
