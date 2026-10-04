import { describe, expect, it } from "vitest";
import {
  canArmLive,
  createSession,
  type Event,
  MAX_SAMPLES,
  type Session,
  updateSession,
} from "./engine";
import { recipe } from "./recipes";

function event(
  state: Session,
  type: Exclude<Event["type"], "sample">,
  nowMs: number,
  holdNowMs?: number,
) {
  return updateSession(state, {
    type,
    nowMs,
    ...(holdNowMs === undefined ? {} : { holdNowMs }),
  });
}
function sample(state: Session, atMs: number, grams: number, nowMs = atMs) {
  return updateSession(state, {
    type: "sample",
    nowMs,
    sample: { atMs, grams },
  });
}
function ready(atMs = 600) {
  let state = event(
    createSession(recipe, 15, "live", atMs - 600),
    "tare",
    atMs - 600,
  );
  for (const time of [atMs - 500, atMs - 250, atMs])
    state = sample(state, time, 0);
  return state;
}
function armed(atMs = 600) {
  return event(ready(atMs), "arm", atMs);
}
describe("brew state and clock", () => {
  it("manual starts once, jumps to elapsed time and rejects invalid clocks", () => {
    let state = event(createSession(recipe, 15, "timer"), "start", 500);
    state = event(state, "start", 1000);
    expect(state.originMs).toBe(500);
    state = event(state, "tick", 120500);
    expect(state.elapsedMs).toBe(120000);
    expect(event(state, "tick", 1)).toBe(state);
    expect(event(state, "tick", NaN)).toBe(state);
    expect(() => createSession(recipe, 15, "timer", -1)).toThrow();
    expect(() => createSession(recipe, 15, "timer", Infinity)).toThrow();
    expect(event(state, "done", 129999).phase).toBe("brewing");
    state = event(state, "done", 130500);
    expect(state.phase).toBe("completed");
    expect(event(state, "done", 135000)).toBe(state);
    expect(sample(state, 140000, 0)).toBe(state);
    expect(state.pouredGrams).toBeNull();
    expect(state.samples).toEqual([]);
  });
  it("does not detect preparation pours or accept timer measurements", () => {
    let state = createSession(recipe, 15, "live");
    state = sample(state, 100, 20);
    state = sample(state, 600, 30);
    expect(state.phase).toBe("preparation");
    expect(event(state, "arm", 600).phase).toBe("preparation");
    expect(
      event(event(createSession(recipe, 15, "timer"), "tare", 0), "arm", 0)
        .phase,
    ).toBe("preparation");
    expect(
      sample(event(createSession(recipe, 15, "timer"), "start", 0), 100, 90)
        .lastSample,
    ).toBeNull();
  });
  it("backdates sustained rise after idle and keeps the first accepted start", () => {
    let state = armed();
    for (let time = 750; time <= 30000; time += 250)
      state = sample(state, time, 0);
    state = sample(state, 30250, 1.5);
    state = sample(state, 30500, 3.2);
    expect(state.originMs).toBe(30000);
    expect(state.elapsedMs).toBe(500);
    expect(event(state, "start", 30500).originMs).toBe(30000);
    let manual = event(armed(), "start", 700);
    manual = sample(manual, 750, 0);
    manual = sample(manual, 1000, 4);
    expect(manual.originMs).toBe(700);
  });
  it("rejects isolated bumps and resets the candidate on a flat reading", () => {
    let state = sample(armed(), 750, 0);
    for (const time of [1000, 1250, 1500]) state = sample(state, time, 5);
    expect(state.phase).toBe("armed");
    state = sample(state, 1750, 6);
    state = sample(state, 2000, 8.1);
    expect(state.originMs).toBe(1500);
  });
  it("holds cancel for exactly one real second and release/repeats preserve safety", () => {
    let state = event(createSession(recipe, 15, "timer", 1000), "start", 1000);
    state = event(state, "hold", 2000, 5000);
    state = event(state, "hold", 4000, 5500);
    state = event(state, "tick", 5996, 5999);
    expect(state.phase).toBe("brewing");
    expect(event(state, "tick", 6000, 6000).phase).toBe("cancelled");
    state = event(state, "release", 5996, 5999);
    expect(event(state, "tick", 12000, 8500).phase).toBe("brewing");
    state = event(state, "hold", 13000, 10000);
    expect(event(state, "release", 16000, 10999).phase).toBe("brewing");
    expect(event(state, "hold", 13000, NaN)).toBe(state);
    expect(event(state, "hold", 13000, Infinity)).toBe(state);
    const cancelled = event(state, "tick", 17000, 11000);
    expect(cancelled.originMs).toBeNull();
    expect(cancelled.samples).toEqual([]);
    expect(event(cancelled, "start", 25000)).toBe(cancelled);
    expect(sample(cancelled, 25000, 999)).toBe(cancelled);
  });
  it("keeps settled water through spikes and negative removal, with bounded chart history", () => {
    let state = event(ready(), "start", 600);
    for (let time = 700; time <= 1700; time += 100)
      state = sample(state, time, 250);
    expect(state.pouredGrams).toBe(250);
    state = sample(state, 1800, 900);
    state = sample(state, 1900, -80);
    for (let time = 2000; time <= 300600; time += 100)
      state = sample(state, time, 0);
    expect(state.pouredGrams).toBe(250);
    expect(state.samples.length).toBeLessThanOrEqual(MAX_SAMPLES);
    expect(state.samples[0]?.atMs).toBe(100);
    expect(state.samples.at(-1)?.atMs).toBe(300000);
  });
  it("records relative times at a nonzero origin", () => {
    let state = event(ready(10000), "start", 10000);
    state = sample(state, 10250, 10);
    state = sample(state, 10500, 20);
    expect(state.samples).toEqual([
      { atMs: 250, grams: 10, segment: 0 },
      { atMs: 500, grams: 20, segment: 0 },
    ]);
  });
  it("rejects malformed, stale, duplicate and out-of-order samples", () => {
    let state = event(createSession(recipe, 15, "live"), "start", 0);
    state = sample(state, 100, 10, 600);
    state = sample(state, 200, 20, 600);
    for (const [atMs, grams, delivered] of [
      [NaN, 30, 700],
      [-1, 30, 700],
      [201, NaN, 700],
      [200, 30, 700],
      [199, 30, 700],
      [701, 30, 700],
    ]) {
      const rejected = sample(state, atMs ?? 0, grams ?? 0, delivered);
      expect(rejected.lastSample).toEqual(state.lastSample);
      expect(rejected.samples).toEqual(state.samples);
    }
    const stale = sample(state, 201, 30, 702);
    expect(stale.lastSample).toBeNull();
    expect(stale.samples).toEqual(state.samples);
  });
  it("requires a full half-second stable window even at high sample frequency", () => {
    let state = event(ready(), "start", 600);
    for (let time = 610; time < 1190; time += 10) {
      state = sample(state, time, 250);
      expect(state.pouredGrams).toBeNull();
    }
    state = sample(state, 1190, 250);
    expect(state.pouredGrams).toBe(250);
  });
  it("pre-arm delayed samples never establish onset; two readings are insufficient", () => {
    let state = armed(1000);
    const last = state.lastSample;
    state = sample(state, 900, 99, 1000);
    expect(state.lastSample).toEqual(last);
    state = sample(state, 1100, 1);
    state = sample(state, 1600, 5);
    expect(state.phase).toBe("armed");
    state = sample(state, 1850, 7);
    expect(state.originMs).toBe(1100);
  });
  it.each([10, 20, 100, 250])(
    "detects a sustained pour at %sms sampling",
    (interval) => {
      let state = armed();
      for (let time = 750; time <= 1750; time += interval)
        state = sample(state, time, ((time - 750) / 1000) * 5);
      expect(state.phase).toBe("brewing");
      expect(state.originMs).toBe(750);
    },
  );
  it("requires both half a second and three grams independently", () => {
    let state = sample(armed(10000), 10050, 10);
    state = sample(state, 10150, 12);
    state = sample(state, 10250, 14);
    expect(state.phase).toBe("armed");
    state = sample(state, 10549, 16);
    expect(state.phase).toBe("armed");
    state = sample(state, 10650, 17);
    expect(state.originMs).toBe(10050);
    let below = sample(armed(), 750, 10);
    below = sample(below, 1000, 11);
    below = sample(below, 1250, 12.9);
    expect(below.phase).toBe("armed");
    let exact = sample(armed(), 750, 10);
    exact = sample(exact, 1000, 11.5);
    exact = sample(exact, 1250, 13);
    expect(exact.originMs).toBe(750);
  });
});

describe("live stream readiness and loss", () => {
  function ready() {
    let state = event(createSession(recipe, 15, "live"), "tare", 0);
    for (const atMs of [100, 350, 600]) state = sample(state, atMs, 0);
    return state;
  }
  it("freezes elapsed time and recorded weights after a physical disconnect, ignoring late events", () => {
    let state = event(ready(), "start", 600);
    state = sample(state, 850, 100);
    state = sample(state, 1100, 100);
    const recorded = state.samples;
    state = event(state, "disconnect", 1200);
    expect(state.phase).toBe("interrupted");
    expect(state.elapsedMs).toBe(600);
    expect(state.samples).toBe(recorded);
    expect(state.missingData).toBe(true);
    for (const type of ["tick", "start", "done", "tare", "signalLost"] as const)
      expect(event(state, type, 130000)).toBe(state);
    expect(sample(state, 130000, 250)).toBe(state);
  });
  it("disarm returns to preparation needing a fresh tare, and is ignored elsewhere", () => {
    let state = event(armed(), "disarm", 700);
    expect(state.phase).toBe("preparation");
    expect(state.tared).toBe(false);
    expect(state.armedAtMs).toBeNull();
    expect(state.lastSample).toBeNull();
    for (const time of [750, 1000, 1250]) state = sample(state, time, 0);
    expect(event(state, "arm", 1250).phase).toBe("preparation");
    state = event(state, "tare", 1250);
    for (const time of [1500, 1750, 2000]) state = sample(state, time, 0);
    expect(event(state, "arm", 2000).phase).toBe("armed");
    expect(event(ready(), "disarm", 700).phase).toBe("preparation");
    const brewing = event(armed(), "start", 700);
    expect(event(brewing, "disarm", 800).phase).toBe("brewing");
  });
  it("disarms on physical disconnect while leaving timer mode unaffected", () => {
    const state = event(event(ready(), "arm", 600), "disconnect", 700);
    expect(state.phase).toBe("preparation");
    expect(state.tared).toBe(false);
    expect(state.lastSample).toBeNull();
    const timer = event(createSession(recipe, 15, "timer"), "start", 0);
    expect(event(timer, "disconnect", 100)).toBe(timer);
    expect(event(timer, "tick", 1000).elapsedMs).toBe(1000);
  });
  it("requires fresh stable zero after tare and disarms on silence immediately after arming", () => {
    let state = event(createSession(recipe, 15, "live"), "tare", 0);
    expect(event(state, "arm", 0).phase).toBe("preparation");
    for (const atMs of [100, 350, 600]) state = sample(state, atMs, 4);
    expect(event(state, "arm", 600).phase).toBe("preparation");
    state = event(ready(), "arm", 600);
    expect(state.phase).toBe("armed");
    state = event(state, "tick", 1101);
    expect(state.phase).toBe("preparation");
    expect(state.tared).toBe(false);
    expect(state.detector.last).toBeNull();
    expect(state.lastSample).toBeNull();
    expect(state.baselineVerified).toBe(false);
    expect(event(state, "start", 1101).baselineVerified).toBe(false);
  });
  it("stable zero readings cannot arm without an explicit successful tare", () => {
    let state = createSession(recipe, 15, "live");
    for (const atMs of [100, 350, 600]) state = sample(state, atMs, 0);
    expect(state.settled.readings).toHaveLength(3);
    expect(canArmLive(state)).toBe(false);
    expect(event(state, "arm", 600).phase).toBe("preparation");
    state = event(state, "tare", 600);
    expect(state.phase).toBe("preparation");
    expect(canArmLive(state)).toBe(false);
    for (const atMs of [850, 1100, 1350]) state = sample(state, atMs, 0);
    expect(event(state, "arm", 1350).phase).toBe("armed");
  });
  it("rejects oscillation near zero but accepts a stable one-gram range at the boundary", () => {
    let unstable = event(createSession(recipe, 15, "live"), "tare", 0);
    for (const [atMs, grams] of [
      [100, -0.75],
      [350, 0.75],
      [600, -0.75],
    ])
      unstable = sample(unstable, atMs ?? 0, grams ?? 0);
    expect(canArmLive(unstable)).toBe(false);
    expect(event(unstable, "arm", 600).phase).toBe("preparation");
    let stable = event(createSession(recipe, 15, "live"), "tare", 0);
    for (const [atMs, grams] of [
      [100, -0.5],
      [350, 0.5],
      [600, 0],
    ])
      stable = sample(stable, atMs ?? 0, grams ?? 0);
    expect(canArmLive(stable)).toBe(true);
    expect(event(stable, "arm", 600).phase).toBe("armed");
  });
  it("requires three zero readings spanning a full half-second and keeps readiness only while fresh", () => {
    let short = event(createSession(recipe, 15, "live"), "tare", 0);
    for (const atMs of [100, 350, 599]) short = sample(short, atMs, 0);
    expect(canArmLive(short)).toBe(false);
    expect(event(short, "arm", 599).phase).toBe("preparation");
    short = sample(short, 600, 0);
    expect(canArmLive(short)).toBe(true);
    let sparse = event(createSession(recipe, 15, "live"), "tare", 0);
    sparse = sample(sparse, 100, 0);
    sparse = sample(sparse, 600, 0);
    expect(canArmLive(sparse)).toBe(false);
    sparse = sample(sparse, 700, 0);
    expect(canArmLive(sparse)).toBe(true);
    expect(event(ready(), "arm", 1100).phase).toBe("armed");
    expect(event(ready(), "arm", 1101).phase).toBe("preparation");
    expect(canArmLive(event(ready(), "tick", 1101))).toBe(false);
  });
  it("preserves the armed zero baseline through detected start and an uninterrupted measured brew", () => {
    let state = event(ready(), "arm", 600);
    expect(state.baselineVerified).toBe(true);
    for (const [atMs, grams] of [
      [750, 0],
      [1000, 1.5],
      [1250, 3.2],
    ])
      state = sample(state, atMs ?? 0, grams ?? 0);
    expect(state.phase).toBe("brewing");
    expect(state.originMs).toBe(750);
    expect(state.baselineVerified).toBe(true);
    for (let atMs = 1500; atMs <= 130750; atMs += 250)
      state = sample(state, atMs, 250);
    state = event(state, "done", 130750);
    expect(state.phase).toBe("completed");
    expect(state.pouredGrams).toBe(250);
    expect(state.elapsedMs).toBe(130000);
    expect(state.missingData).toBe(false);
  });
  it("manual start while armed keeps the verified zero baseline and wins over detection", () => {
    let state = event(ready(), "arm", 600);
    expect(state.baselineVerified).toBe(true);
    state = sample(state, 750, 0);
    state = sample(state, 1000, 1.5);
    expect(state.phase).toBe("armed");
    state = event(state, "start", 1100);
    expect(state.originMs).toBe(1100);
    expect(state.baselineVerified).toBe(true);
    state = sample(state, 1250, 3.2);
    expect(state.originMs).toBe(1100);
    for (const atMs of [1500, 1750, 2000, 2250])
      state = sample(state, atMs, 250);
    expect(state.pouredGrams).toBe(250);
    expect(state.missingData).toBe(false);
  });
  it("keeps timer through loss, separates chart segments and prevents settlement across gaps", () => {
    let state = event(ready(), "start", 600);
    state = sample(state, 850, 100);
    state = sample(state, 1100, 100);
    state = event(state, "signalLost", 1200);
    expect(state.originMs).toBe(600);
    expect(state.elapsedMs).toBe(600);
    expect(state.missingData).toBe(true);
    expect(state.pouredGrams).toBeNull();
    state = sample(state, 1300, 100);
    state = sample(state, 1550, 100);
    expect(state.pouredGrams).toBeNull();
    state = sample(state, 1800, 100);
    expect(state.pouredGrams).toBe(100);
    expect(state.samples[0]?.segment).not.toBe(state.samples.at(-1)?.segment);
  });
  it("marks manual start without any received stream as missing and still permits timer completion", () => {
    let state = event(createSession(recipe, 15, "live"), "start", 0);
    expect(state.missingData).toBe(true);
    state = event(state, "done", 130000);
    expect(state.phase).toBe("completed");
    expect(state.pouredGrams).toBeNull();
  });
  it("ignores tare and arm outside preparation and rejects negative hold clocks", () => {
    const armed = event(ready(), "arm", 600);
    const retared = event(armed, "tare", 700);
    expect(retared.phase).toBe("armed");
    expect(retared.lastSample).toEqual({ atMs: 600, grams: 0 });
    expect(retared.settled).toBe(armed.settled);
    expect(event(armed, "arm", 700).armedAtMs).toBe(600);
    const brewing = event(armed, "start", 700);
    expect(canArmLive(brewing)).toBe(true);
    expect(event(brewing, "arm", 800).phase).toBe("brewing");
    expect(event(brewing, "tare", 800).lastSample).toEqual({
      atMs: 600,
      grams: 0,
    });
    expect(event(brewing, "hold", 800, -1)).toBe(brewing);
    expect(event(brewing, "hold", 800, 0).holdAtMs).toBe(0);
  });
});

it("live manual readings without a verified zero baseline cannot become poured-water estimates", () => {
  let state = event(createSession(recipe, 15, "live"), "start", 0);
  for (const atMs of [100, 350, 600, 850]) state = sample(state, atMs, 500);
  expect(state.baselineVerified).toBe(false);
  expect(state.pouredGrams).toBeNull();
  expect(state.samples.length).toBe(4);
});
