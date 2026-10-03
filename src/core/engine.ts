import { type Recipe, scaleRecipe } from "./recipe";
import type { ScaleSample } from "./scale";
export type Mode = "timer" | "fake" | "learn" | "live";
export type Phase =
  | "preparation"
  | "armed"
  | "brewing"
  | "completed"
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
  onset: ScaleSample | null;
  riseCount: number;
  detectorLast: ScaleSample | null;
  lastSample: ScaleSample | null;
  stable: readonly ScaleSample[];
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
        | "signalLost";
      nowMs: number;
      holdNowMs?: number;
    }
  | { type: "sample"; nowMs: number; sample: ScaleSample; holdNowMs?: number };
export const HOLD_MS = 3000;
export const MAX_SAMPLES = 600;
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
    onset: null,
    riseCount: 0,
    detectorLast: null,
    lastSample: null,
    stable: [],
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
    baselineVerified:
      state.mode !== "live" || state.baselineVerified || canArmLive(state),
    missingData:
      state.missingData || (state.mode === "live" && state.lastSample === null),
    originMs,
    elapsedMs: state.nowMs - originMs,
    armedAtMs: null,
    onset: null,
    riseCount: 0,
    detectorLast: null,
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
export function canArmLive(state: Session): boolean {
  const first = state.stable[0];
  return (
    state.tared &&
    state.lastSample !== null &&
    state.nowMs - state.lastSample.atMs <= 500 &&
    first !== undefined &&
    state.lastSample.atMs - first.atMs >= 500 &&
    state.stable.length >= 3 &&
    Math.max(...state.stable.map((sample) => sample.grams)) -
      Math.min(...state.stable.map((sample) => sample.grams)) <=
      1 &&
    state.stable.every((sample) => Math.abs(sample.grams) <= 1)
  );
}
function loseSignal(state: Session): Session {
  return {
    ...state,
    phase: state.phase === "armed" ? "preparation" : state.phase,
    tared: false,
    baselineVerified: state.phase === "brewing" && state.baselineVerified,
    armedAtMs: null,
    onset: null,
    riseCount: 0,
    detectorLast: null,
    lastSample: null,
    stable: [],
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
    state.nowMs - sample.atMs > 500 ||
    (state.lastSample !== null && sample.atMs <= state.lastSample.atMs)
  )
    return state;
  if (
    state.phase === "armed" &&
    state.armedAtMs !== null &&
    sample.atMs < state.armedAtMs
  )
    return state;
  const gap =
    state.lastSample === null || sample.atMs - state.lastSample.atMs > 500;
  let next: Session = { ...state, lastSample: sample };
  if (
    state.phase === "armed" &&
    state.armedAtMs !== null &&
    sample.atMs >= state.armedAtMs
  ) {
    const reference = state.detectorLast;
    if (gap || reference === null)
      next = { ...next, detectorLast: sample, onset: null, riseCount: 0 };
    else if (sample.atMs - reference.atMs >= 100) {
      const rising = sample.grams - reference.grams > 0.15;
      const onset = rising ? (state.onset ?? reference) : null;
      next = {
        ...next,
        detectorLast: sample,
        onset,
        riseCount: rising ? state.riseCount + 1 : 0,
      };
    }
    const onset = next.onset;
    if (
      onset !== null &&
      next.riseCount >= 2 &&
      sample.atMs - onset.atMs >= 500 &&
      sample.grams - onset.grams >= 3
    )
      next = begin(next, onset.atMs);
  }
  if (next.mode === "live" && next.phase === "preparation") {
    return {
      ...next,
      stable: gap
        ? [sample]
        : [
            ...next.stable.filter(
              (item) =>
                sample.atMs - item.atMs <= 750 &&
                Math.floor(item.atMs / 100) !== Math.floor(sample.atMs / 100),
            ),
            sample,
          ],
    };
  }
  if (
    next.phase !== "brewing" ||
    next.originMs === null ||
    sample.atMs < next.originMs
  )
    return next;
  const bucket = Math.floor(sample.atMs / 100);
  const stable = gap
    ? [sample]
    : [
        ...next.stable.filter(
          (item) =>
            sample.atMs - item.atMs <= 750 &&
            Math.floor(item.atMs / 100) !== bucket,
        ),
        sample,
      ];
  let pouredGrams = next.pouredGrams;
  if (
    (next.mode !== "live" || next.baselineVerified) &&
    stable.length >= 3 &&
    sample.atMs - (stable[0]?.atMs ?? sample.atMs) >= 500
  ) {
    const weights = stable.map((item) => item.grams);
    if (Math.max(...weights) - Math.min(...weights) <= 1) {
      const settled =
        weights.reduce((sum, grams) => sum + grams, 0) / weights.length;
      if (settled >= 0) pouredGrams = Math.max(pouredGrams ?? 0, settled);
    }
  }
  return {
    ...next,
    stable,
    pouredGrams,
    samples: appendSample(next.samples, {
      atMs: sample.atMs - next.originMs,
      grams: sample.grams,
      ...(next.mode === "live" ? { segment: next.segment } : {}),
    }),
  };
}
export function updateSession(state: Session, event: Event): Session {
  if (!Number.isFinite(event.nowMs) || event.nowMs < state.nowMs) return state;
  if (state.phase === "completed" || state.phase === "cancelled") return state;
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
    event.nowMs - next.lastSample.atMs > 500
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
      onset: null,
      riseCount: 0,
      detectorLast: null,
      holdAtMs: null,
      holdElapsedMs: 0,
      samples: [],
      stable: [],
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
          stable: [],
          onset: null,
        };
      break;
    case "arm":
      if (
        next.phase === "preparation" &&
        next.tared &&
        next.mode !== "timer" &&
        (next.mode !== "live" || canArmLive(next))
      )
        next = {
          ...next,
          phase: "armed",
          baselineVerified: next.mode !== "live" || canArmLive(next),
          armedAtMs: event.nowMs,
          onset: null,
          riseCount: 0,
          detectorLast: null,
          lastSample: next.mode === "live" ? next.lastSample : null,
        };
      break;
    case "start":
      if (next.phase === "preparation" || next.phase === "armed")
        next = begin(next, event.nowMs);
      break;
    case "done":
      if (next.phase === "brewing" && next.elapsedMs >= 125000)
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
