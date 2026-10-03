import { describe, expect, it } from "vitest";
import {
  createSession,
  type Event,
  MAX_SAMPLES,
  type Session,
  updateSession,
} from "./engine";

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
function armed() {
  return event(event(createSession(15, "fake"), "tare", 0), "arm", 0);
}
describe("brew state and clock", () => {
  it("manual starts once, jumps directly to correct elapsed, rejects regression and invalid clocks", () => {
    let s = event(createSession(15, "timer"), "start", 500);
    s = event(s, "start", 1000);
    expect(s.originMs).toBe(500);
    s = event(s, "tick", 120500);
    expect(s.elapsedMs).toBe(120000);
    expect(event(s, "tick", 1)).toBe(s);
    expect(event(s, "tick", NaN)).toBe(s);
    expect(() => createSession(15, "timer", -1)).toThrow();
    expect(() => createSession(15, "timer", Infinity)).toThrow();
    expect(event(s, "done", 124999).phase).toBe("brewing");
    s = event(s, "done", 125500);
    expect(s.phase).toBe("completed");
    expect(event(s, "done", 130000)).toBe(s);
    expect(sample(s, 140000, 0)).toBe(s);
    expect(s.pouredGrams).toBeNull();
    expect(s.samples).toEqual([]);
  });
  it("requires explicit arm AND tare; never detects preparation or timer-only samples", () => {
    let s = createSession(15, "fake");
    s = sample(s, 100, 20);
    s = sample(s, 600, 30);
    expect(s.phase).toBe("preparation");
    expect(event(s, "arm", 600).phase).toBe("preparation");
    s = event(s, "tare", 600);
    expect(s.phase).toBe("preparation");
    expect(
      event(event(createSession(15, "timer"), "tare", 0), "arm", 0).phase,
    ).toBe("preparation");
    const timer = sample(
      event(createSession(15, "timer"), "start", 0),
      100,
      90,
    );
    expect(timer.lastSample).toBeNull();
  });
  it("backdates only sustained fresh consecutive rise after idle; first accepted start wins both races", () => {
    let s = armed();
    for (let t = 0; t <= 30000; t += 250) s = sample(s, t, 0);
    s = sample(s, 30250, 1.5);
    s = sample(s, 30500, 3.2);
    expect(s.originMs).toBe(30000);
    expect(s.elapsedMs).toBe(500);
    expect(event(s, "start", 30500).originMs).toBe(30000);
    let manual = event(armed(), "start", 100);
    manual = sample(manual, 100, 0);
    manual = sample(manual, 600, 4);
    expect(manual.originMs).toBe(100);
  });
  it("rejects isolated bumps, stale and unordered samples and gaps; resets candidate on flat", () => {
    let s = sample(armed(), 0, 0);
    s = sample(s, 250, 5);
    s = sample(s, 500, 5);
    s = sample(s, 750, 5);
    expect(s.phase).toBe("armed");
    const old = s;
    expect(sample(s, 100, 99, 800).lastSample).toEqual(old.lastSample);
    expect(sample(s, 2000, 99, 1000).lastSample).toEqual(old.lastSample);
    expect(sample(s, 900, NaN).lastSample).toEqual(old.lastSample);
    s = sample(s, 2000, 9);
    expect(s.phase).toBe("armed");
    s = sample(s, 2250, 10);
    s = sample(s, 2500, 12.1);
    expect(s.originMs).toBe(2000);
  });
  it("hold cancellation respects exact real threshold, release, repeats, clock speed and terminal state", () => {
    let s = event(createSession(15, "learn"), "start", 0);
    s = event(s, "hold", 0, 0);
    s = event(s, "hold", 4000, 1000);
    s = event(s, "tick", 11996, 2999);
    expect(s.phase).toBe("brewing");
    s = event(s, "release", 11996, 2999);
    expect(s.holdAtMs).toBeNull();
    s = event(s, "hold", 12000, 3000);
    s = event(s, "release", 24000, 6000);
    expect(s.phase).toBe("cancelled");
    expect(s.originMs).toBeNull();
    expect(event(s, "start", 25000)).toBe(s);
    expect(sample(s, 25000, 999)).toBe(s);
    const fresh = createSession(15, "fake", 25000);
    expect(fresh.phase).toBe("preparation");
    expect(fresh.tared).toBe(false);
  });
  it("retains sustained readings at100ms intervals and rejects spikes/removal; bounds chart while retaining onset", () => {
    let s = event(createSession(15, "fake"), "start", 0);
    for (let t = 0; t <= 1000; t += 100) s = sample(s, t, 250);
    expect(s.pouredGrams).toBe(250);
    s = sample(s, 1100, 900);
    s = sample(s, 1200, -80);
    for (let t = 1300; t <= 300000; t += 100) s = sample(s, t, 0);
    expect(s.pouredGrams).toBe(250);
    expect(s.samples.length).toBeLessThanOrEqual(MAX_SAMPLES);
    expect(s.samples[0]?.atMs).toBe(0);
    expect(s.samples.at(-1)?.atMs).toBe(300000);
  });
});
it("pre-arm delayed samples never establish onset; two readings are not sustained evidence", () => {
  let s = event(
    event(createSession(15, "fake", 1000), "tare", 1000),
    "arm",
    1000,
  );
  s = sample(s, 900, 0, 1000);
  expect(s.lastSample).toBeNull();
  s = sample(s, 1100, 1);
  s = sample(s, 1600, 5);
  expect(s.phase).toBe("armed");
  s = sample(s, 1850, 7);
  expect(s.originMs).toBe(1100);
});
it("settles high-frequency input and rejects invalid hold clocks", () => {
  let s = event(createSession(15, "fake"), "start", 0);
  for (let t = 0; t <= 1000; t += 10) s = sample(s, t, 250);
  expect(s.pouredGrams).toBe(250);
  expect(event(s, "hold", 1000, NaN)).toBe(s);
  expect(event(s, "hold", 1000, Infinity)).toBe(s);
});
it.each([10, 20, 100, 250])(
  "detects the same5g/s sustained pour at %sms sampling",
  (interval) => {
    let s = armed();
    for (let t = 0; t <= 1000; t += interval) s = sample(s, t, (t / 1000) * 5);
    expect(s.phase).toBe("brewing");
    expect(s.originMs).toBe(0);
  },
);
describe("nonzero session origins and independent signal gates", () => {
  function armAt(atMs: number) {
    return event(
      event(createSession(15, "fake", atMs), "tare", atMs),
      "arm",
      atMs,
    );
  }
  it("records chart timestamps relative to a nonzero manual start", () => {
    let state = event(createSession(15, "fake", 9000), "start", 10000);
    state = sample(state, 10250, 10);
    state = sample(state, 10500, 20);
    expect(state.samples).toEqual([
      { atMs: 250, grams: 10 },
      { atMs: 500, grams: 20 },
    ]);
    expect(state.elapsedMs).toBe(500);
  });
  it("requires half a second even when a fresh continuous rise already exceeds three grams", () => {
    let state = sample(armAt(10000), 10000, 10);
    state = sample(state, 10100, 12);
    state = sample(state, 10200, 14);
    expect(state.phase).toBe("armed");
    state = sample(state, 10499, 16);
    expect(state.phase).toBe("armed");
    state = sample(state, 10600, 17);
    expect(state.originMs).toBe(10000);
    expect(state.elapsedMs).toBe(600);
  });
  it("requires three grams independently of the duration gate and accepts its exact threshold", () => {
    let below = sample(armAt(10000), 10000, 10);
    below = sample(below, 10250, 11);
    below = sample(below, 10500, 12.9);
    expect(below.phase).toBe("armed");
    let exact = sample(armAt(10000), 10000, 10);
    exact = sample(exact, 10250, 11.5);
    exact = sample(exact, 10500, 13);
    expect(exact.phase).toBe("brewing");
    expect(exact.originMs).toBe(10000);
    expect(exact.elapsedMs).toBe(500);
  });
  it("rejects malformed, stale, duplicate and out-of-order readings during brewing", () => {
    let state = event(createSession(15, "fake"), "start", 0);
    state = sample(state, 100, 10, 600); // exactly500ms old is fresh
    expect(state.lastSample).toEqual({ atMs: 100, grams: 10 });
    state = sample(state, 200, 20, 600);
    for (const [atMs, grams, delivered] of [
      [NaN, 30, 700],
      [-1, 30, 700],
      [201, NaN, 700],
      [201, 30, 702],
      [200, 30, 700],
      [199, 30, 700],
      [701, 30, 700],
    ]) {
      const rejected = sample(state, atMs ?? 0, grams ?? 0, delivered);
      expect(rejected.lastSample).toEqual(state.lastSample);
      expect(rejected.samples).toEqual(state.samples);
    }
  });
  it("uses elapsed physical hold duration at a nonzero origin without repeated keydown resetting it", () => {
    let state = event(createSession(15, "learn", 1000), "start", 1000);
    state = event(state, "hold", 2000, 5000);
    state = event(state, "hold", 6000, 6000);
    state = event(state, "tick", 9996, 7999);
    expect(state.phase).toBe("brewing");
    expect(event(state, "tick", 10000, 8000).phase).toBe("cancelled");
    state = event(state, "release", 9996, 7999);
    expect(event(state, "tick", 12000, 8500).phase).toBe("brewing");
    state = event(state, "hold", 13000, 10000);
    state = event(state, "release", 16000, 12999);
    expect(state.phase).toBe("brewing");
  });
});
it("accepts settled poured water only after a full half-second stable window", () => {
  let state = event(createSession(15, "fake"), "start", 0);
  for (const atMs of [0, 100, 200, 300, 400, 499]) {
    state = sample(state, atMs, 250);
    expect(state.pouredGrams).toBeNull();
  }
  state = sample(state, 500, 250);
  expect(state.pouredGrams).toBe(250);
});

describe("live stream readiness and loss", () => {
  function ready() {
    let state = event(createSession(15, "live"), "tare", 0);
    for (const atMs of [100, 350, 600]) state = sample(state, atMs, 0);
    return state;
  }
  it("requires fresh stable zero after tare and disarms on silence immediately after arming", () => {
    let state = event(createSession(15, "live"), "tare", 0);
    expect(event(state, "arm", 0).phase).toBe("preparation");
    for (const atMs of [100, 350, 600]) state = sample(state, atMs, 4);
    expect(event(state, "arm", 600).phase).toBe("preparation");
    state = event(ready(), "arm", 600);
    expect(state.phase).toBe("armed");
    state = event(state, "tick", 1101);
    expect(state.phase).toBe("preparation");
    expect(state.tared).toBe(false);
    expect(state.detectorLast).toBeNull();
    expect(state.lastSample).toBeNull();
    expect(state.baselineVerified).toBe(false);
    expect(event(state, "start", 1101).baselineVerified).toBe(false);
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
    let state = event(createSession(15, "live"), "start", 0);
    expect(state.missingData).toBe(true);
    state = event(state, "done", 125000);
    expect(state.phase).toBe("completed");
    expect(state.pouredGrams).toBeNull();
  });
});

it("live manual readings without a verified zero baseline cannot become poured-water estimates", () => {
  let state = event(createSession(15, "live"), "start", 0);
  for (const atMs of [100, 350, 600, 850]) state = sample(state, atMs, 500);
  expect(state.baselineVerified).toBe(false);
  expect(state.pouredGrams).toBeNull();
  expect(state.samples.length).toBe(4);
});
