import { describe, expect, it } from "vitest";
import {
  addReading,
  EMPTY_SETTLED,
  highestSettled,
  readsZero,
  type Settled,
  settledGrams,
} from "./settled";

function window(readings: [number, number][]): Settled {
  let state = EMPTY_SETTLED;
  for (const [atMs, grams] of readings)
    state = addReading(state, { atMs, grams }, true);
  return state;
}

describe("settled weight window", () => {
  it("restarts at a discontinuous reading", () => {
    const state = addReading(
      window([
        [0, 1],
        [250, 1],
      ]),
      { atMs: 900, grams: 2 },
      false,
    );
    expect(state.readings).toEqual([{ atMs: 900, grams: 2 }]);
  });
  it("keeps one reading per 100 ms bucket and at most 750 ms of history", () => {
    expect(
      window([
        [100, 1],
        [150, 2],
        [199, 3],
      ]).readings,
    ).toEqual([{ atMs: 199, grams: 3 }]);
    expect(
      window([
        [0, 1],
        [250, 1],
        [750, 1],
        [751, 1],
      ]).readings.map((item) => item.atMs),
    ).toEqual([250, 751]);
    expect(
      window([
        [100, 1],
        [850, 1],
      ]).readings.map((item) => item.atMs),
    ).toEqual([100, 850]);
  });
  it("settles at the mean of three readings spanning half a second within 1 g", () => {
    expect(
      settledGrams(
        window([
          [0, 10],
          [250, 10.5],
          [500, 11],
        ]),
      ),
    ).toBeCloseTo(10.5);
  });
  it.each<[string, [number, number][]]>([
    ["empty", []],
    [
      "two readings",
      [
        [0, 5],
        [600, 5],
      ],
    ],
    [
      "a short span",
      [
        [0, 5],
        [250, 5],
        [499, 5],
      ],
    ],
    [
      "a range above 1 g",
      [
        [0, 5],
        [250, 6.01],
        [500, 5],
      ],
    ],
  ])("is unsettled with %s", (_, readings) => {
    expect(settledGrams(window(readings))).toBeNull();
  });
  it("reads zero only when settled within 1 g of zero", () => {
    expect(
      readsZero(
        window([
          [0, -1],
          [250, 0],
          [500, 0],
        ]),
      ),
    ).toBe(true);
    expect(
      readsZero(
        window([
          [0, 1.01],
          [250, 1.01],
          [500, 1.01],
        ]),
      ),
    ).toBe(false);
    expect(
      readsZero(
        window([
          [0, 0],
          [250, 0],
        ]),
      ),
    ).toBe(false);
    expect(
      readsZero(
        window([
          [0, 0.5],
          [250, 1.2],
          [500, 1.2],
        ]),
      ),
    ).toBe(false);
  });
  it("raises the estimate to the highest nonnegative settled weight", () => {
    const settled = window([
      [0, 250],
      [250, 250],
      [500, 250],
    ]);
    const unsettled = window([[0, 900]]);
    const negative = window([
      [0, -80],
      [250, -80],
      [500, -80],
    ]);
    const zero = window([
      [0, 0],
      [250, 0],
      [500, 0],
    ]);
    expect(highestSettled(null, settled)).toBe(250);
    expect(highestSettled(300, settled)).toBe(300);
    expect(highestSettled(100, settled)).toBe(250);
    expect(highestSettled(null, unsettled)).toBeNull();
    expect(highestSettled(100, unsettled)).toBe(100);
    expect(highestSettled(null, negative)).toBeNull();
    expect(highestSettled(null, zero)).toBe(0);
  });
});
