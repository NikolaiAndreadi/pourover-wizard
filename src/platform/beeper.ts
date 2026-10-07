export interface Tone {
  hz: number;
  perSecond: number;
  beepMs: number;
}
export interface Note {
  hz: number;
  offsetMs: number;
  beepMs: number;
}
export interface Beeper {
  unlock(): void;
  play(tone: Tone | null): void;
  chime(notes: readonly Note[]): void;
}
export interface BeeperOptions {
  fadeMs?: number;
}
interface Oscillator {
  frequency: { value: number };
  connect(node: unknown): unknown;
  disconnect(): void;
  onended: ((event: Event) => void) | null;
  start(when: number): void;
  stop(when?: number): void;
}
interface Gain {
  gain: Pick<
    AudioParam,
    "setValueAtTime" | "linearRampToValueAtTime" | "cancelScheduledValues"
  >;
  connect(node: unknown): unknown;
  disconnect(): void;
}
export interface Audio {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  close?(): Promise<void>;
  createGain(): Gain;
  createOscillator(): Oscillator;
}
const LOOKAHEAD_S = 0.15;
const TICK_MS = 50;
const START_LEAD_S = 0.02;
const VOLUME = 0.3;
const LATE_MS = 250;
// A "running" context whose clock stands still this long is not rendering.
const STALL_MS = 1000;
function defaultAudio(): Audio | undefined {
  const session = (
    globalThis.navigator as { audioSession?: { type: string } } | undefined
  )?.audioSession;
  // Mix with other audio and stay quiet when the phone is muted.
  if (session) session.type = "ambient";
  return globalThis.AudioContext ? new AudioContext() : undefined;
}
/**
 * Beeps on the audio clock, scheduled slightly ahead from a coarse timer so
 * the rhythm stays even while the main thread is busy.
 */
export function createBeeper(
  makeAudio: () => Audio | undefined = defaultAudio,
  { fadeMs = 100 }: BeeperOptions = {},
): Beeper {
  if (!Number.isFinite(fadeMs) || fadeMs < 0)
    throw new RangeError("fadeMs must be a finite, non-negative number");
  let audio: Audio | undefined;
  let tone: Tone | null = null;
  let nextAt = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let pendingResume: Promise<void> | undefined;
  let clockTime = -1;
  let clockSeenAt = 0;
  let stalled = false;
  let replaced = false;
  const live = new Map<
    Oscillator,
    { gain: Gain; at: number; end: number; edge: number; cancellable: boolean }
  >();
  const purge = () => {
    for (const [node, { gain }] of live)
      try {
        node.stop();
        node.disconnect();
        gain.disconnect();
      } catch {}
    live.clear();
    nextAt = 0;
  };
  // iOS can keep reporting "running" after an interruption while the clock is
  // frozen; everything queued then bursts out together once it restarts. Drop
  // what is waiting and start over on a fresh context, once per stall without
  // a gesture since a replacement may not be allowed to start on its own.
  const ready = (context: Audio) => {
    if (context.state !== "running") {
      clockTime = -1;
      return false;
    }
    const now = Date.now();
    if (context.currentTime !== clockTime) {
      clockTime = context.currentTime;
      clockSeenAt = now;
      stalled = false;
      return true;
    }
    if (stalled) return false;
    if (now - clockSeenAt < STALL_MS) return true;
    if (replaced) {
      stalled = true;
      purge();
    } else {
      replaced = true;
      replace();
    }
    return false;
  };
  const beep = (
    context: Audio,
    current: Pick<Tone, "hz" | "beepMs">,
    at: number,
    cancellable = true,
  ) => {
    const length = current.beepMs / 1000;
    const edge = Math.min(fadeMs / 1000, length / 2);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(VOLUME, at + edge);
    if (length > 2 * edge) gain.gain.setValueAtTime(VOLUME, at + length - edge);
    gain.gain.linearRampToValueAtTime(0, at + length);
    gain.connect(context.destination);
    const node = context.createOscillator();
    node.frequency.value = current.hz;
    node.connect(gain);
    node.onended = () => {
      live.delete(node);
      node.disconnect();
      gain.disconnect();
    };
    live.set(node, { gain, at, end: at + length, edge, cancellable });
    node.start(at);
    node.stop(at + length);
    run();
  };
  const schedule = () => {
    const context = audio;
    if (!context || !tone || !ready(context)) return;
    const now = context.currentTime;
    // Leave time to submit the whole envelope before the audio thread starts it.
    nextAt = Math.max(nextAt, now + START_LEAD_S);
    while (nextAt < now + LOOKAHEAD_S) {
      beep(context, tone, nextAt);
      nextAt += 1 / tone.perSecond;
    }
  };
  const silence = () => {
    const now = audio?.currentTime ?? 0;
    for (const [node, entry] of live) {
      const { gain, at, end, edge, cancellable } = entry;
      if (!cancellable) continue;
      // Keep fading nodes available to stall recovery until onended runs.
      entry.cancellable = false;
      try {
        if (now <= at || now >= end || edge === 0) {
          node.stop();
          node.disconnect();
          gain.disconnect();
          live.delete(node);
          continue;
        }
        // Preserve the envelope's current level when replacing its automation.
        const level =
          VOLUME * Math.min(1, (now - at) / edge, (end - now) / edge);
        const stopAt = Math.min(now + edge, end);
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(level, now);
        gain.gain.linearRampToValueAtTime(0, stopAt);
        node.stop(stopAt);
      } catch {}
    }
    nextAt = 0;
  };
  const wake = () => {
    if (!audio || audio.state === "running") return;
    if (pendingResume) return pendingResume;
    try {
      pendingResume = audio.resume();
    } catch {
      return;
    }
    void pendingResume.then(
      () => {
        pendingResume = undefined;
        try {
          schedule();
        } catch {}
      },
      () => {
        pendingResume = undefined;
      },
    );
    return pendingResume;
  };
  const tick = () => {
    wake();
    if (audio && ready(audio)) schedule();
    if (!tone && live.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
  const run = () => {
    timer ??= setInterval(tick, TICK_MS);
  };
  const replace = () => {
    const old = audio;
    purge();
    audio = undefined;
    pendingResume = undefined;
    stalled = false;
    clockTime = -1;
    try {
      void old?.close?.().catch(() => {});
    } catch {}
    try {
      audio = makeAudio();
    } catch {}
    tick();
  };
  return {
    unlock() {
      try {
        if (audio) ready(audio);
        replaced = false;
        if (stalled) return replace();
        audio ??= makeAudio();
        pendingResume = undefined;
        tick();
      } catch {}
    },
    play(next) {
      if (next === tone) return;
      silence();
      tone = next;
      if (!tone) return;
      tick();
      run();
    },
    chime(notes) {
      const ring = (lateMs: number) => {
        const context = audio;
        if (!context || !ready(context)) return;
        const start = context.currentTime + START_LEAD_S;
        try {
          for (const note of notes) {
            const offsetMs = note.offsetMs - lateMs;
            if (offsetMs < -LATE_MS) continue;
            const at = start + Math.max(0, offsetMs) / 1000;
            beep(context, note, at, false);
          }
        } catch {}
      };
      if (audio && ready(audio)) return ring(0);
      const askedAt = Date.now();
      void wake()?.then(
        () => ring(Date.now() - askedAt),
        () => {},
      );
    },
  };
}
