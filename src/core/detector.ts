import type { ScaleSample } from "./scale";

/** Readings closer than this to the previous detector reading are not compared. */
export const RISE_SPACING_MS = 100;
/** A comparison counts as a rise only above this increase. */
export const RISE_MIN_GRAMS = 0.15;
export const START_MIN_RISES = 2;
export const START_MIN_SPAN_MS = 500;
export const START_MIN_GRAMS = 3;

/** Auto-start candidate built from consecutive rises after explicit arming. */
export interface Detector {
  readonly onset: ScaleSample | null;
  readonly rises: number;
  readonly last: ScaleSample | null;
}
export const IDLE_DETECTOR: Detector = { onset: null, rises: 0, last: null };

/**
 * Feeds one fresh armed reading. A discontinuous stream restarts detection.
 * `pourStartMs` is the rise baseline time once a sustained pour is detected.
 */
export function observePour(
  state: Detector,
  sample: ScaleSample,
  continuous: boolean,
): { detector: Detector; pourStartMs: number | null } {
  const reference = state.last;
  let detector = state;
  if (!continuous || reference === null)
    detector = { onset: null, rises: 0, last: sample };
  else if (sample.atMs - reference.atMs >= RISE_SPACING_MS) {
    const rising = sample.grams - reference.grams > RISE_MIN_GRAMS;
    detector = {
      onset: rising ? (state.onset ?? reference) : null,
      rises: rising ? state.rises + 1 : 0,
      last: sample,
    };
  }
  const { onset } = detector;
  const pourStartMs =
    onset !== null &&
    detector.rises >= START_MIN_RISES &&
    sample.atMs - onset.atMs >= START_MIN_SPAN_MS &&
    sample.grams - onset.grams >= START_MIN_GRAMS
      ? onset.atMs
      : null;
  return { detector, pourStartMs };
}
