import type { ScaleSample } from "./scale";

/** Readings older than this, relative to the newest, leave the window. */
export const SETTLE_WINDOW_MS = 750;
/** The window keeps at most one reading per bucket, so fast streams cannot shorten the span. */
export const SETTLE_BUCKET_MS = 100;
export const SETTLE_SPAN_MS = 500;
export const SETTLE_MIN_READINGS = 3;
export const SETTLE_RANGE_GRAMS = 1;
export const ZERO_TOLERANCE_GRAMS = 1;

/** Recent unsmoothed readings used to estimate a settled weight. */
export interface Settled {
  readonly readings: readonly ScaleSample[];
}
export const EMPTY_SETTLED: Settled = { readings: [] };

/** A discontinuous stream restarts the window at the new reading. */
export function addReading(
  state: Settled,
  sample: ScaleSample,
  continuous: boolean,
): Settled {
  if (!continuous) return { readings: [sample] };
  const bucket = Math.floor(sample.atMs / SETTLE_BUCKET_MS);
  return {
    readings: [
      ...state.readings.filter(
        (item) =>
          sample.atMs - item.atMs <= SETTLE_WINDOW_MS &&
          Math.floor(item.atMs / SETTLE_BUCKET_MS) !== bucket,
      ),
      sample,
    ],
  };
}

/** Mean of the window once it spans enough time within the allowed range; otherwise null. */
export function settledGrams(state: Settled): number | null {
  const { readings } = state;
  const first = readings[0];
  const last = readings.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    readings.length < SETTLE_MIN_READINGS ||
    last.atMs - first.atMs < SETTLE_SPAN_MS
  )
    return null;
  const weights = readings.map((item) => item.grams);
  if (Math.max(...weights) - Math.min(...weights) > SETTLE_RANGE_GRAMS)
    return null;
  return weights.reduce((sum, grams) => sum + grams, 0) / weights.length;
}

/** The window is settled and every reading is within tolerance of zero. */
export function readsZero(state: Settled): boolean {
  return (
    settledGrams(state) !== null &&
    state.readings.every((item) => Math.abs(item.grams) <= ZERO_TOLERANCE_GRAMS)
  );
}

/** Highest nonnegative settled weight seen so far; brief spikes and removal never lower it. */
export function highestSettled(
  previous: number | null,
  state: Settled,
): number | null {
  const settled = settledGrams(state);
  return settled !== null && settled >= 0
    ? Math.max(previous ?? 0, settled)
    : previous;
}
