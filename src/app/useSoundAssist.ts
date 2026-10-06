import { useCallback, useEffect, useRef, useState } from "react";
import { createBeeper, type Note, type Tone } from "@/platform/beeper";
import { createSoundAssistMemory } from "@/platform/soundAssist";
import type { Pace } from "./pace";

const TONES: Record<Pace, Tone | null> = {
  faster: { hz: 1200, perSecond: 6, beepMs: 60 },
  steady: null,
  slower: { hz: 500, perSecond: 2, beepMs: 220 },
};
const CHIME: Note[] = [
  { hz: 523.25, offsetMs: 0, beepMs: 120 },
  { hz: 659.25, offsetMs: 100, beepMs: 120 },
  { hz: 783.99, offsetMs: 200, beepMs: 180 },
];
const FINISH: Note[] = [
  { hz: 523.25, offsetMs: 0, beepMs: 150 },
  { hz: 659.25, offsetMs: 150, beepMs: 150 },
  { hz: 783.99, offsetMs: 300, beepMs: 150 },
  { hz: 1046.5, offsetMs: 450, beepMs: 300 },
];
const COUNT: Note[] = [{ hz: 880, offsetMs: 0, beepMs: 150 }];
const GO: Note[] = [0, 110, 220].map((offsetMs) => ({
  hz: 1760,
  offsetMs,
  beepMs: 70,
}));
const COUNT_FROM = 3;
// Longer than the brew tick, so each mark is queued on the audio clock before it is due.
const LEAD_MS = 250;
const delayed = (notes: readonly Note[], ms: number) =>
  notes.map((note) => ({ ...note, offsetMs: note.offsetMs + ms }));
const memory = createSoundAssistMemory();
const beeper = createBeeper(undefined, { fadeMs: 50 });
export interface SoundAssistModel {
  soundAssist: boolean;
  toggleSoundAssist(): void;
}
export function useSoundAssist(
  pace: Pace | null,
  pourStep: boolean | null,
  nextPour: { atMs: number; inMs: number } | null,
  completed: boolean,
): SoundAssistModel {
  const [on, setOn] = useState(() => memory.load());
  const wasPouring = useRef(pourStep);
  const wasCompleted = useRef(completed);
  useEffect(() => {
    if (on && completed && !wasCompleted.current) beeper.chime(FINISH);
    wasCompleted.current = completed;
  }, [on, completed]);
  // The next countdown second to queue; 0 is the go signal, -1 once it is queued.
  const mark = useRef(COUNT_FROM);
  const countdownPour = useRef<number | null>(null);
  const nextPourAtMs = nextPour?.atMs ?? null;
  const nextPourInMs = nextPour?.inMs ?? null;
  useEffect(() => {
    if (countdownPour.current !== nextPourAtMs) {
      countdownPour.current = nextPourAtMs;
      if (nextPourAtMs !== null) mark.current = COUNT_FROM;
    }
    if (nextPourInMs === null) return;
    for (; mark.current >= 0; mark.current -= 1) {
      const delayMs = nextPourInMs - mark.current * 1000;
      if (delayMs >= LEAD_MS) break;
      if (on && delayMs > -LEAD_MS)
        beeper.chime(delayed(mark.current ? COUNT : GO, Math.max(0, delayMs)));
    }
  }, [on, nextPourAtMs, nextPourInMs]);
  useEffect(() => {
    const was = wasPouring.current;
    wasPouring.current = pourStep;
    if (on && was === true && pourStep === false) beeper.chime(CHIME);
    if (on && was !== true && pourStep === true && mark.current >= 0)
      beeper.chime(GO);
    if (pourStep !== false) mark.current = COUNT_FROM;
  }, [on, pourStep]);
  useEffect(() => {
    if (!on) return;
    const unlock = () => beeper.unlock();
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("pointerup", unlock, true);
    document.addEventListener("keydown", unlock, true);
    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("pointerup", unlock, true);
      document.removeEventListener("keydown", unlock, true);
    };
  }, [on]);
  const tone = on && pace ? TONES[pace] : null;
  useEffect(() => {
    beeper.play(tone);
    return () => beeper.play(null);
  }, [tone]);
  const toggleSoundAssist = useCallback(() => {
    const next = !on;
    memory.save(next);
    if (next) {
      beeper.unlock();
      beeper.chime(CHIME);
    }
    setOn(next);
  }, [on]);
  return { soundAssist: on, toggleSoundAssist };
}
