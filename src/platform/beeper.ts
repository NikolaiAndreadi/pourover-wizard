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
export interface Audio {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  createGain(): {
    gain: Pick<
      AudioParam,
      "setValueAtTime" | "linearRampToValueAtTime" | "cancelScheduledValues"
    >;
    connect(node: unknown): unknown;
    disconnect(): void;
  };
  createOscillator(): Oscillator;
}
const LOOKAHEAD_S = 0.15;
const TICK_MS = 50;
const START_LEAD_S = 0.02;
const VOLUME = 0.3;
const LATE_MS = 250;
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
  const queued = new Map<
    Oscillator,
    {
      gain: ReturnType<Audio["createGain"]>["gain"];
      at: number;
      end: number;
      edge: number;
    }
  >();
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
      queued.delete(node);
      node.disconnect();
      gain.disconnect();
    };
    if (cancellable)
      queued.set(node, { gain: gain.gain, at, end: at + length, edge });
    node.start(at);
    node.stop(at + length);
  };
  const schedule = () => {
    const context = audio;
    if (!context || !tone || context.state !== "running") return;
    const now = context.currentTime;
    // Leave time to submit the whole envelope before the audio thread starts it.
    nextAt = Math.max(nextAt, now + START_LEAD_S);
    while (nextAt < now + LOOKAHEAD_S) {
      beep(context, tone, nextAt);
      nextAt += 1 / tone.perSecond;
    }
  };
  const silence = () => {
    clearInterval(timer);
    timer = undefined;
    const now = audio?.currentTime ?? 0;
    for (const [node, { gain, at, end, edge }] of queued)
      try {
        if (now <= at || now >= end || edge === 0) {
          node.stop();
          continue;
        }
        // Preserve the envelope's current level when replacing its automation.
        const level =
          VOLUME * Math.min(1, (now - at) / edge, (end - now) / edge);
        const stopAt = Math.min(now + edge, end);
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(level, now);
        gain.linearRampToValueAtTime(0, stopAt);
        node.stop(stopAt);
      } catch {}
    queued.clear();
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
    schedule();
  };
  return {
    unlock() {
      try {
        audio ??= makeAudio();
        tick();
      } catch {}
    },
    play(next) {
      if (next === tone) return;
      silence();
      tone = next;
      if (!tone) return;
      tick();
      timer = setInterval(tick, TICK_MS);
    },
    chime(notes) {
      const ring = (lateMs: number) => {
        const context = audio;
        if (context?.state !== "running") return;
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
      if (audio?.state === "running") return ring(0);
      const askedAt = Date.now();
      void wake()?.then(
        () => ring(Date.now() - askedAt),
        () => {},
      );
    },
  };
}
