import { describe, expect, it } from "vitest";
import { type Detector, IDLE_DETECTOR, observePour } from "./detector";

function feed(readings: [number, number][], continuous = true) {
  let detector: Detector = IDLE_DETECTOR;
  let pourStartMs: number | null = null;
  for (const [atMs, grams] of readings) {
    ({ detector, pourStartMs } = observePour(
      detector,
      { atMs, grams },
      continuous,
    ));
    if (pourStartMs !== null) break;
  }
  return { detector, pourStartMs };
}

describe("auto-start pour detector", () => {
  it("starts at the rise baseline after two rises, half a second and three grams", () => {
    expect(
      feed([
        [0, 0],
        [250, 1.5],
        [500, 3.2],
      ]).pourStartMs,
    ).toBe(0);
  });
  it("uses the first reading as reference without a candidate", () => {
    const { detector, pourStartMs } = observePour(
      IDLE_DETECTOR,
      { atMs: 0, grams: 50 },
      true,
    );
    expect(detector).toEqual({
      onset: null,
      rises: 0,
      last: { atMs: 0, grams: 50 },
    });
    expect(pourStartMs).toBeNull();
  });
  it("restarts from the new reading after a stream discontinuity", () => {
    const rising = feed([
      [0, 0],
      [250, 1.5],
    ]).detector;
    const { detector, pourStartMs } = observePour(
      rising,
      { atMs: 600, grams: 5 },
      false,
    );
    expect(detector).toEqual({
      onset: null,
      rises: 0,
      last: { atMs: 600, grams: 5 },
    });
    expect(pourStartMs).toBeNull();
  });
  it("ignores readings closer than 100 ms to the reference", () => {
    const start = feed([[0, 0]]).detector;
    const close = observePour(start, { atMs: 99, grams: 10 }, true).detector;
    expect(close).toBe(start);
    const spaced = observePour(start, { atMs: 100, grams: 10 }, true).detector;
    expect(spaced.rises).toBe(1);
    expect(spaced.onset).toEqual({ atMs: 0, grams: 0 });
  });
  it("counts only increases above 0.15 g and resets the candidate otherwise", () => {
    expect(
      feed([
        [0, 0],
        [100, 0.15],
      ]).detector,
    ).toMatchObject({ rises: 0, onset: null });
    expect(
      feed([
        [0, 0],
        [100, 0.16],
      ]).detector,
    ).toMatchObject({ rises: 1, onset: { atMs: 0 } });
    expect(
      feed([
        [0, 0],
        [250, 2],
        [500, 2],
      ]).detector,
    ).toEqual({ onset: null, rises: 0, last: { atMs: 500, grams: 2 } });
  });
  it("keeps the first onset across consecutive rises", () => {
    expect(
      feed([
        [0, 0],
        [100, 1],
        [200, 2],
      ]).detector,
    ).toMatchObject({ rises: 2, onset: { atMs: 0, grams: 0 } });
  });
  it.each<[string, [number, number][]]>([
    [
      "a single rise",
      [
        [0, 0],
        [600, 5],
      ],
    ],
    [
      "under half a second",
      [
        [0, 0],
        [250, 2],
        [499, 5],
      ],
    ],
    [
      "under three grams",
      [
        [0, 0],
        [250, 1.5],
        [500, 2.99],
      ],
    ],
  ])("does not start on %s", (_, readings) => {
    expect(feed(readings).pourStartMs).toBeNull();
  });
  it("may start on a closely spaced reading once an existing candidate qualifies", () => {
    expect(
      feed([
        [0, 0],
        [210, 1],
        [420, 2],
        [510, 3.2],
      ]).pourStartMs,
    ).toBe(0);
  });
});
