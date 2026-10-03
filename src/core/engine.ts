import { type Detector, IDLE_DETECTOR, observePour } from "./detector";
import { drawdownStartMs, type Recipe, scaleRecipe } from "./recipe";
import type { ScaleSample } from "./scale";
import {
  addReading,
  EMPTY_SETTLED,
  highestSettled,
  readsZero,
  type Settled,
} from "./settled";
export type Mode = "timer" | "live";
export type Phase =
  | "preparation"
  | "armed"
  | "brewing"
  | "completed"
  | "interrupted"
  | "cancelled";
export interface Session {
  phase: Phase;
  mode: Mode;
  recipe: Recipe;
  nowMs: number;
  originMs: number | null;
  elapsedMs: number;
  tared: boolean;
  armedAtMs: number | null;
  /** Auto-start detection; only fed while armed. */
  detector: Detector;
  lastSample: ScaleSample | null;
  /** Settled-weight window for zero readiness and poured-water estimates. */
  settled: Settled;
  samples: readonly ScaleSample[];
  pouredGrams: number | null;
  missingData: boolean;
  baselineVerified: boolean;
  segment: number;
  holdAtMs: number | null;
  holdElapsedMs: number;
}
export type Event =
  | {
      type:
        | "tick"
        | "tare"
        | "arm"
        | "start"
        | "done"
        | "hold"
        | "release"
        | "signalLost"
        | "disconnect";
      nowMs: number;
      holdNowMs?: number;
    }
  | { type: "sample"; nowMs: number; sample: ScaleSample; holdNowMs?: number };
export const HOLD_MS = 1000;
export const MAX_SAMPLES = 600;
/** Readings older than this are stale; larger gaps break stream continuity. */
const FRESH_MS = 500;
export function createSession(dose: number, mode: Mode, nowMs = 0): Session {
  if (!Number.isFinite(nowMs) || nowMs < 0)
    throw new Error("Clock must be finite and nonnegative.");
  return {
    phase: "preparation",
    mode,
    recipe: scaleRecipe(dose),
    nowMs,
    originMs: null,
    elapsedMs: 0,
    tared: false,
    armedAtMs: null,
    detector: IDLE_DETECTOR,
    lastSample: null,
    settled: EMPTY_SETTLED,
    samples: [],
    pouredGrams: null,
    missingData: false,
    baselineVerified: false,
    segment: 0,
    holdAtMs: null,
    holdElapsedMs: 0,
  };
}
function begin(state: Session, originMs: number): Session {
  return {
    ...state,
    phase: "brewing",
    baselineVerified: state.baselineVerified || canArmLive(state),
    missingData:
      state.missingData || (state.mode === "live" && state.lastSample === null),
    originMs,
    elapsedMs: state.nowMs - originMs,
    armedAtMs: null,
    detector: IDLE_DETECTOR,
  };
}
function appendSample(
  samples: readonly ScaleSample[],
  sample: ScaleSample,
): readonly ScaleSample[] {
  const all = [...samples, sample];
  return all.length > MAX_SAMPLES
    ? all.filter((_, index) => index % 2 === 0 || index === all.length - 1)
    : all;
}
/** A tared scale is freshly reporting a settled zero. */
export function canArmLive(state: Session): boolean {
  return (
    state.tared &&
    state.lastSample !== null &&
    state.nowMs - state.lastSample.atMs <= FRESH_MS &&
    readsZero(state.settled)
  );
}
function loseSignal(state: Session): Session {
  return {
    ...state,
    phase: state.phase === "armed" ? "preparation" : state.phase,
    tared: false,
    baselineVerified: state.phase === "brewing" && state.baselineVerified,
    armedAtMs: null,
    detector: IDLE_DETECTOR,
    lastSample: null,
    settled: EMPTY_SETTLED,
    segment: state.segment + 1,
    missingData: state.missingData || state.phase === "brewing",
  };
}
function receiveSample(state: Session, sample: ScaleSample): Session {
  if (
    state.mode === "timer" ||
    !Number.isFinite(sample.atMs) ||
    sample.atMs < 0 ||
    !Number.isFinite(sample.grams) ||
    sample.atMs > state.nowMs ||
    state.nowMs - sample.atMs > FRESH_MS ||
    (state.lastSample !== null && sample.atMs <= state.lastSample.atMs)
  )
    return state;
  if (
    state.phase === "armed" &&
    state.armedAtMs !== null &&
    sample.atMs < state.armedAtMs
  )
    return state;
  const continuous =
    state.lastSample !== null &&
    sample.atMs - state.lastSample.atMs <= FRESH_MS;
  let next: Session = { ...state, lastSample: sample };
  if (state.phase === "armed") {
    const { detector, pourStartMs } = observePour(
      state.detector,
      sample,
      continuous,
    );
    next = { ...next, detector };
    if (pourStartMs !== null) next = begin(next, pourStartMs);
  }
  if (next.phase === "preparation")
    return { ...next, settled: addReading(next.settled, sample, continuous) };
  if (
    next.phase !== "brewing" ||
    next.originMs === null ||
    sample.atMs < next.originMs
  )
    return next;
  const settled = addReading(next.settled, sample, continuous);
  return {
    ...next,
    settled,
    pouredGrams: next.baselineVerified
      ? highestSettled(next.pouredGrams, settled)
      : next.pouredGrams,
    samples: appendSample(next.samples, {
      atMs: sample.atMs - next.originMs,
      grams: sample.grams,
      segment: next.segment,
    }),
  };
}
export function updateSession(state: Session, event: Event): Session {
  if (!Number.isFinite(event.nowMs) || event.nowMs < state.nowMs) return state;
  if (
    state.phase === "completed" ||
    state.phase === "cancelled" ||
    state.phase === "interrupted"
  )
    return state;
  if (event.type === "disconnect") {
    if (state.mode !== "live") return state;
    if (state.phase === "brewing")
      return {
        ...state,
        phase: "interrupted",
        nowMs: event.nowMs,
        elapsedMs: event.nowMs - (state.originMs ?? event.nowMs),
        missingData: true,
        holdAtMs: null,
        holdElapsedMs: 0,
      };
    return loseSignal({ ...state, nowMs: event.nowMs });
  }
  if (
    event.holdNowMs !== undefined &&
    (!Number.isFinite(event.holdNowMs) || event.holdNowMs < 0)
  )
    return state;
  let next = {
    ...state,
    nowMs: event.nowMs,
    elapsedMs: state.originMs === null ? 0 : event.nowMs - state.originMs,
  };
  if (
    next.mode === "live" &&
    next.lastSample !== null &&
    event.nowMs - next.lastSample.atMs > FRESH_MS
  )
    next = loseSignal(next);
  const holdNowMs = event.holdNowMs ?? event.nowMs;
  next.holdElapsedMs =
    next.holdAtMs === null ? 0 : Math.max(0, holdNowMs - next.holdAtMs);
  if (next.holdAtMs !== null && next.holdElapsedMs >= HOLD_MS)
    return {
      ...next,
      phase: "cancelled",
      originMs: null,
      elapsedMs: 0,
      armedAtMs: null,
      detector: IDLE_DETECTOR,
      holdAtMs: null,
      holdElapsedMs: 0,
      samples: [],
      settled: EMPTY_SETTLED,
      pouredGrams: null,
      tared: false,
    };
  switch (event.type) {
    case "tare":
      if (next.phase === "preparation")
        next = {
          ...next,
          tared: true,
          lastSample: null,
          settled: EMPTY_SETTLED,
          detector: IDLE_DETECTOR,
        };
      break;
    case "arm":
      if (
        next.phase === "preparation" &&
        next.tared &&
        next.mode === "live" &&
        canArmLive(next)
      )
        next = {
          ...next,
          phase: "armed",
          baselineVerified: canArmLive(next),
          armedAtMs: event.nowMs,
          detector: IDLE_DETECTOR,
        };
      break;
    case "start":
      if (next.phase === "preparation" || next.phase === "armed")
        next = begin(next, event.nowMs);
      break;
    case "done":
      if (
        next.phase === "brewing" &&
        next.elapsedMs >= drawdownStartMs(next.recipe)
      )
        next = { ...next, phase: "completed", holdAtMs: null };
      break;
    case "hold":
      if (next.holdAtMs === null) next.holdAtMs = holdNowMs;
      break;
    case "sample":
      next = receiveSample(next, event.sample);
      break;
    case "release":
      next = { ...next, holdAtMs: null, holdElapsedMs: 0 };
      break;
    case "signalLost":
      next = loseSignal(next);
      break;
    case "tick":
      break;
  }
  return next;
}
