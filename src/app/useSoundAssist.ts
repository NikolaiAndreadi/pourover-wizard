import { useCallback, useEffect, useRef, useState } from "react";
import { createBeeper, type Note, type Tone } from "@/platform/beeper";
import { createSoundAssistMemory } from "@/platform/soundAssist";
import type { Pace } from "./pace";

const TONES: Record<Pace, Tone | null> = {
  faster: { hz: 1200, perSecond: 6, beepMs: 60 },
  steady: null,
  slower: { hz: 500, perSecond: 2, beepMs: 220 },
};
/** Rising C major arpeggio (C5, E5, G5) that signals the end of a pour. */
const STOP_CHIME: Note[] = [
  { hz: 523.25, offsetMs: 0, beepMs: 120 },
  { hz: 659.25, offsetMs: 100, beepMs: 120 },
  { hz: 783.99, offsetMs: 200, beepMs: 180 },
];
const memory = createSoundAssistMemory();
const beeper = createBeeper(undefined, { fadeMs: 50 });
export interface SoundAssistModel {
  soundAssist: boolean;
  toggleSoundAssist(): void;
}
export function useSoundAssist(
  pace: Pace | null,
  pourStep: boolean | null,
): SoundAssistModel {
  const [on, setOn] = useState(() => memory.load());
  const wasPouring = useRef(pourStep);
  useEffect(() => {
    if (on && wasPouring.current === true && pourStep === false)
      beeper.chime(STOP_CHIME);
    wasPouring.current = pourStep;
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
    if (next) beeper.unlock();
    setOn(next);
  }, [on]);
  return { soundAssist: on, toggleSoundAssist };
}
