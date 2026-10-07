import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Audio, createBeeper } from "./beeper";

function fakeAudio(state = "suspended") {
  const beeps: { hz: number; at: number; until: number; cut: boolean }[] = [];
  const nodes: ReturnType<Audio["createOscillator"]>[] = [];
  const gains: ReturnType<Audio["createGain"]>[] = [];
  const audio = {
    currentTime: 0,
    state,
    destination: {},
    resumes: 0,
    close: vi.fn(async () => undefined),
    async resume() {
      audio.resumes += 1;
      audio.state = "running";
    },
    createGain() {
      const gain = {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          cancelScheduledValues: vi.fn(),
        },
        connect: () => undefined,
        disconnect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    },
    createOscillator() {
      const beep = { hz: 0, at: 0, until: 0, cut: false };
      const node = {
        onended: null as (() => void) | null,
        frequency: {
          set value(hz: number) {
            beep.hz = hz;
          },
        },
        connect: () => undefined,
        disconnect: vi.fn(),
        start(at: number) {
          beep.at = at;
          beeps.push(beep);
        },
        stop(until?: number) {
          if (until === undefined) beep.cut = true;
          else beep.until = until;
        },
      };
      nodes.push(node);
      return node;
    },
  };
  return { audio: audio satisfies Audio, beeps, nodes, gains };
}
const fast = { hz: 1200, perSecond: 6, beepMs: 60 };
const slow = { hz: 500, perSecond: 2, beepMs: 220 };

describe("beeper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  it("stays silent until unlocked, then keeps the requested rhythm", async () => {
    const { audio, beeps } = fakeAudio();
    const beeper = createBeeper(() => audio);
    beeper.play(fast);
    vi.advanceTimersByTime(200);
    expect(beeps).toEqual([]);
    beeper.unlock();
    await vi.runOnlyPendingTimersAsync();
    expect(audio.resumes).toBe(1);
    for (let tick = 1; tick <= 20; tick += 1) {
      audio.currentTime = tick * 0.05;
      vi.advanceTimersByTime(50);
    }
    expect(beeps.length).toBeGreaterThanOrEqual(6);
    expect(beeps.every((beep) => beep.hz === 1200)).toBe(true);
    const starts = beeps.map((beep) => beep.at);
    const gaps = starts.slice(1).map((at, i) => at - (starts[i] ?? 0));
    expect(gaps.every((gap) => Math.abs(gap - 1 / 6) < 1e-9)).toBe(true);
    expect(beeps[0] && beeps[0].until - beeps[0].at).toBeCloseTo(0.06);
  });
  it("cuts active and queued beeps when the tone changes or stops", () => {
    const { audio, beeps } = fakeAudio("running");
    const beeper = createBeeper(() => audio);
    beeper.unlock();
    beeper.play(fast);
    audio.currentTime = 0.1;
    vi.advanceTimersByTime(50);
    const queued = beeps.filter((beep) => beep.at > 0.1);
    expect(queued.length).toBeGreaterThan(0);
    beeper.play(slow);
    expect(queued.every((beep) => beep.cut)).toBe(true);
    expect(beeps.slice(0, -1).every((beep) => beep.cut)).toBe(true);
    expect(beeps.at(-1)?.hz).toBe(500);
    const count = beeps.length;
    beeper.play(null);
    expect(beeps.every((beep) => beep.cut)).toBe(true);
    audio.currentTime = 5;
    vi.advanceTimersByTime(1000);
    expect(beeps.length).toBe(count);
  });
  it("disconnects finished nodes and removes them from cancellation", () => {
    const { audio, nodes, gains, beeps } = fakeAudio("running");
    const beeper = createBeeper(() => audio);
    beeper.unlock();
    beeper.play(fast);
    nodes[0]!.onended!(new Event("ended"));
    expect(nodes[0]!.disconnect).toHaveBeenCalledOnce();
    expect(gains[0]!.disconnect).toHaveBeenCalledOnce();
    beeper.play(null);
    expect(beeps[0]!.cut).toBe(false);
  });
  it.each([0, 1, 1000])(
    "uses both fades without overlapping peak events at clock %s",
    (clock) => {
      const { audio, gains, beeps } = fakeAudio("running");
      audio.currentTime = clock;
      const beeper = createBeeper(() => audio, { fadeMs: 100 });
      beeper.unlock();
      beeper.play(slow);
      const at = beeps[0]!.at;
      expect(at).toBeGreaterThan(audio.currentTime);
      expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
        0.3,
        at + 0.1,
      );
      expect(gains[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(
        0.3,
        at + 0.22 - 0.1,
      );
      expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
        0,
        at + 0.22,
      );
      beeper.play(fast);
      expect(gains[1]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
        0.3,
        at + 0.03,
      );
      expect(gains[1]!.gain.setValueAtTime).toHaveBeenCalledExactlyOnceWith(
        0,
        at,
      );
      expect(gains[1]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
        0,
        at + 0.06,
      );
    },
  );
  it.each([0.05, 0.11, 0.17])(
    "fades from the current level when stopped at %s seconds",
    (elapsed) => {
      const { audio, gains, beeps } = fakeAudio("running");
      const beeper = createBeeper(() => audio, { fadeMs: 100 });
      beeper.unlock();
      beeper.play(slow);
      const at = beeps[0]!.at;
      const now = at + elapsed;
      audio.currentTime = now;
      beeper.play(null);
      const param = gains[0]!.gain;
      expect(param.cancelScheduledValues).toHaveBeenCalledWith(now);
      const level = elapsed === 0.11 ? 0.3 : 0.15;
      expect(vi.mocked(param.setValueAtTime).mock.lastCall![0]).toBeCloseTo(
        level,
      );
      expect(vi.mocked(param.setValueAtTime).mock.lastCall![1]).toBe(now);
      expect(param.linearRampToValueAtTime).toHaveBeenLastCalledWith(
        0,
        Math.min(now + 0.1, at + 0.22),
      );
      expect(beeps[0]!.cut).toBe(false);
      expect(beeps[0]!.until).toBeCloseTo(Math.min(now + 0.1, at + 0.22));
      beeper.play(null);
      expect(param.cancelScheduledValues).toHaveBeenCalledOnce();
    },
  );
  it("purges a fading tone when its audio clock stalls after stopping", () => {
    const first = fakeAudio("running");
    const second = fakeAudio("running");
    const queue = [first, second];
    const beeper = createBeeper(() => queue.shift()?.audio);
    beeper.unlock();
    beeper.play(slow);
    first.audio.currentTime = first.beeps[0]!.at + 0.05;
    vi.advanceTimersByTime(50);
    beeper.play(null);
    expect(first.beeps[0]!.cut).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(first.beeps[0]!.cut).toBe(true);
    expect(first.nodes[0]!.disconnect).toHaveBeenCalledOnce();
    expect(first.gains[0]!.disconnect).toHaveBeenCalledOnce();
    expect(first.audio.close).toHaveBeenCalledOnce();
    expect(second.beeps).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("tracks a fading tone until it ends without fading it again", () => {
    const { audio, beeps, nodes, gains } = fakeAudio("running");
    const beeper = createBeeper(() => audio);
    beeper.unlock();
    beeper.play(slow);
    audio.currentTime = beeps[0]!.at + 0.05;
    beeper.play(null);
    const stopAt = beeps[0]!.until;
    beeper.play(fast);
    beeper.play(null);
    expect(beeps[0]!.cut).toBe(false);
    expect(beeps[0]!.until).toBe(stopAt);
    expect(gains[0]!.gain.cancelScheduledValues).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(50);
    expect(vi.getTimerCount()).toBe(1);
    nodes[0]!.onended!(new Event("ended"));
    expect(nodes[0]!.disconnect).toHaveBeenCalledOnce();
    expect(gains[0]!.disconnect).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(50);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("schedules a requested tone ahead of the clock when unlocked with running audio", () => {
    const { audio, beeps } = fakeAudio("running");
    const beeper = createBeeper(() => audio);
    beeper.play(fast);
    beeper.unlock();
    expect(beeps).toHaveLength(1);
    expect(beeps[0]!.at).toBeGreaterThan(audio.currentTime);
    expect(audio.resumes).toBe(0);
  });
  it("does not restart a stopped tone after a pending resume completes", async () => {
    const { audio, beeps } = fakeAudio();
    let finishResume = () => {};
    audio.resume = () =>
      new Promise<void>((resolve) => {
        finishResume = () => {
          audio.state = "running";
          resolve();
        };
      });
    const beeper = createBeeper(() => audio);
    beeper.play(fast);
    beeper.unlock();
    beeper.play(null);
    finishResume();
    await Promise.resolve();
    vi.advanceTimersByTime(1000);
    expect(beeps).toEqual([]);
  });
  it("plays a chime once at its offsets, uncut by tone changes", () => {
    const { audio, beeps } = fakeAudio("running");
    const beeper = createBeeper(() => audio);
    beeper.unlock();
    beeper.play(fast);
    const chime = [
      { hz: 523.25, offsetMs: 0, beepMs: 120 },
      { hz: 783.99, offsetMs: 200, beepMs: 180 },
    ];
    beeper.chime(chime);
    const notes = beeps.slice(-2);
    expect(notes.map((beep) => beep.hz)).toEqual([523.25, 783.99]);
    expect(notes[0]!.at).toBeGreaterThan(audio.currentTime);
    expect(notes[1]!.at - notes[0]!.at).toBeCloseTo(0.2);
    expect(notes[1]!.until - notes[1]!.at).toBeCloseTo(0.18);
    beeper.play(null);
    expect(notes.every((beep) => !beep.cut)).toBe(true);
    const count = beeps.length;
    vi.advanceTimersByTime(1000);
    expect(beeps.length).toBe(count);
  });
  it("plays a chime requested while unlock is resuming audio", async () => {
    const { audio, beeps } = fakeAudio();
    let finishResume = () => {};
    audio.resume = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishResume = () => {
            audio.state = "running";
            resolve();
          };
        }),
    );
    const beeper = createBeeper(() => audio);
    beeper.unlock();
    beeper.unlock();
    expect(audio.resume).toHaveBeenCalledTimes(2);
    beeper.chime([{ hz: 523.25, offsetMs: 0, beepMs: 120 }]);
    expect(beeps).toEqual([]);
    finishResume();
    await vi.runOnlyPendingTimersAsync();
    expect(beeps.map((beep) => beep.hz)).toEqual([523.25]);
  });
  it("drops a chime after a failed resume and allows a retry", async () => {
    const { audio, beeps } = fakeAudio();
    const resume = vi
      .spyOn(audio, "resume")
      .mockRejectedValueOnce(new Error("audio unavailable"));
    const beeper = createBeeper(() => audio);
    const notes = [{ hz: 523.25, offsetMs: 0, beepMs: 120 }];
    beeper.unlock();
    beeper.chime(notes);
    audio.state = "running";
    await vi.runOnlyPendingTimersAsync();
    expect(beeps).toEqual([]);
    audio.state = "suspended";
    beeper.unlock();
    beeper.chime(notes);
    await vi.runOnlyPendingTimersAsync();
    expect(resume).toHaveBeenCalledTimes(2);
    expect(beeps.map((beep) => beep.hz)).toEqual([523.25]);
  });
  it("resumes audio that suspends after unlock to play a chime", async () => {
    const { audio, beeps } = fakeAudio();
    const beeper = createBeeper(() => audio);
    beeper.unlock();
    await vi.runOnlyPendingTimersAsync();
    audio.state = "interrupted";
    beeper.chime([{ hz: 523.25, offsetMs: 0, beepMs: 120 }]);
    await vi.runOnlyPendingTimersAsync();
    expect(audio.resumes).toBe(2);
    expect(beeps.map((beep) => beep.hz)).toEqual([523.25]);
  });
  it("drops chime notes that a slow resume made late", async () => {
    const { audio, beeps } = fakeAudio();
    let finishResume = () => {};
    audio.resume = () =>
      new Promise<void>((resolve) => {
        finishResume = () => {
          audio.state = "running";
          resolve();
        };
      });
    const beeper = createBeeper(() => audio);
    beeper.unlock();
    beeper.chime([
      { hz: 523.25, offsetMs: 0, beepMs: 120 },
      { hz: 659.25, offsetMs: 400, beepMs: 120 },
      { hz: 783.99, offsetMs: 600, beepMs: 120 },
    ]);
    vi.advanceTimersByTime(500);
    finishResume();
    await vi.runOnlyPendingTimersAsync();
    expect(beeps.map((beep) => beep.hz)).toEqual([659.25, 783.99]);
    expect(beeps[1]!.at - beeps[0]!.at).toBeCloseTo(0.1);
  });
  it("resumes a playing tone after audio suspends", async () => {
    const { audio, beeps } = fakeAudio();
    const beeper = createBeeper(() => audio);
    beeper.unlock();
    await vi.runOnlyPendingTimersAsync();
    beeper.play(fast);
    audio.state = "suspended";
    const count = beeps.length;
    await vi.advanceTimersByTimeAsync(50);
    audio.currentTime = 1;
    await vi.advanceTimersByTimeAsync(50);
    expect(audio.resumes).toBe(2);
    expect(beeps.length).toBeGreaterThan(count);
  });
  it("replaces audio whose clock stalls and drops what it had queued", () => {
    const first = fakeAudio("running");
    const second = fakeAudio("running");
    const contexts = [first, second];
    const beeper = createBeeper(() => contexts.shift()?.audio);
    beeper.unlock();
    beeper.chime([{ hz: 523.25, offsetMs: 0, beepMs: 120 }]);
    beeper.play(fast);
    expect(first.beeps).toHaveLength(2);
    vi.advanceTimersByTime(950);
    expect(first.audio.close).not.toHaveBeenCalled();
    expect(first.beeps.every((beep) => !beep.cut)).toBe(true);
    vi.advanceTimersByTime(50);
    expect(first.audio.close).toHaveBeenCalledOnce();
    expect(first.beeps).toHaveLength(2);
    expect(first.beeps.every((beep) => beep.cut)).toBe(true);
    for (const node of first.nodes) expect(node.disconnect).toHaveBeenCalled();
    for (const gain of first.gains) expect(gain.disconnect).toHaveBeenCalled();
    expect(second.beeps).toHaveLength(1);
    second.audio.currentTime = 0.2;
    vi.advanceTimersByTime(50);
    expect(second.beeps).toHaveLength(2);
    expect(second.beeps.every((beep) => beep.hz === 1200 && !beep.cut)).toBe(
      true,
    );
  });
  it("stops queuing when the replacement stalls too, until the next unlock", () => {
    const contexts = [
      fakeAudio("running"),
      fakeAudio("running"),
      fakeAudio("running"),
    ];
    const [first, second, third] = contexts as [
      ReturnType<typeof fakeAudio>,
      ReturnType<typeof fakeAudio>,
      ReturnType<typeof fakeAudio>,
    ];
    const queue = [...contexts];
    const beeper = createBeeper(() => queue.shift()?.audio);
    beeper.unlock();
    beeper.play(fast);
    vi.advanceTimersByTime(2000);
    expect(first.audio.close).toHaveBeenCalledOnce();
    expect(second.audio.close).not.toHaveBeenCalled();
    expect(second.beeps).toHaveLength(1);
    expect(second.beeps[0]!.cut).toBe(true);
    beeper.chime([{ hz: 523.25, offsetMs: 0, beepMs: 120 }]);
    vi.advanceTimersByTime(1000);
    expect(second.beeps).toHaveLength(1);
    expect(third.beeps).toHaveLength(0);
    beeper.unlock();
    expect(second.audio.close).toHaveBeenCalledOnce();
    expect(third.beeps).toHaveLength(1);
    expect(third.beeps[0]!.cut).toBe(false);
  });
  it("resumes on the same audio once its clock moves again", () => {
    const queue = [fakeAudio("running"), fakeAudio("running")];
    const second = queue[1]!;
    const beeper = createBeeper(() => queue.shift()?.audio);
    beeper.unlock();
    beeper.play(fast);
    vi.advanceTimersByTime(2000);
    expect(second.beeps).toHaveLength(1);
    expect(second.beeps[0]!.cut).toBe(true);
    second.audio.currentTime = 5;
    vi.advanceTimersByTime(50);
    expect(second.audio.close).not.toHaveBeenCalled();
    expect(second.beeps).toHaveLength(2);
    expect(second.beeps[1]!.cut).toBe(false);
    expect(second.beeps[1]!.at).toBeGreaterThan(5);
  });
  it("skips a chime while audio is locked", () => {
    const { audio, beeps } = fakeAudio();
    createBeeper(() => audio).chime([{ hz: 523.25, offsetMs: 0, beepMs: 120 }]);
    expect(beeps).toEqual([]);
  });
  it("ignores repeated tones, missing audio and failures", () => {
    const { audio, beeps } = fakeAudio("running");
    const beeper = createBeeper(() => audio);
    beeper.unlock();
    beeper.play(fast);
    const count = beeps.length;
    beeper.play(fast);
    expect(beeps.length).toBe(count);
    expect(() => createBeeper(() => undefined).unlock()).not.toThrow();
    const throwing = createBeeper(() => {
      throw new Error("no audio");
    });
    expect(() => throwing.unlock()).not.toThrow();
    expect(() => throwing.play(fast)).not.toThrow();
  });
});
