import { useEffect, useRef, useState } from "react";
import {
  createSession,
  type Event,
  HOLD_MS,
  type Mode,
  type Session,
  updateSession,
} from "@/core/engine";
import { expectedPoints, expectedWeight, stepAt } from "@/core/recipe";
import { fakeSample } from "@/scale/fake";
export type BrewModel = ReturnType<typeof useBrew>;
export function useBrew() {
  const [dose, setDose] = useState("15");
  const [mode, setMode] = useState<Mode>("timer");
  const [speed, setSpeed] = useState(1);
  const [seed, setSeed] = useState("42");
  const [session, setSession] = useState<Session | null>(null);
  const clock = useRef({ real: performance.now(), virtual: 0, speed: 1 });
  const active = useRef<Session | null>(null);
  const fakeOrigin = useRef<number | null>(null);
  const lastFake = useRef(-Infinity);
  const now = () =>
    clock.current.virtual +
    (performance.now() - clock.current.real) * clock.current.speed;
  const dispatch = (type: Event["type"]) => {
    if (!active.current || type === "sample") return;
    active.current = updateSession(active.current, {
      type,
      nowMs: now(),
      holdNowMs: performance.now(),
    });
    if (
      type === "start" &&
      active.current.originMs !== null &&
      fakeOrigin.current === null
    )
      fakeOrigin.current = active.current.originMs;
    setSession(active.current);
  };
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!active.current) return;
      const atMs = now();
      let next = updateSession(active.current, {
        type: "tick",
        nowMs: atMs,
        holdNowMs: performance.now(),
      });
      if (next.mode !== "timer" && atMs - lastFake.current >= 250) {
        lastFake.current = atMs;
        next = updateSession(next, {
          type: "sample",
          nowMs: atMs,
          holdNowMs: performance.now(),
          sample: fakeSample(
            atMs,
            fakeOrigin.current,
            next.recipe.waterGrams,
            Number(seed),
          ),
        });
      }
      active.current = next;
      setSession(next);
    }, 100);
    const release = () => {
      if (!active.current) return;
      active.current = updateSession(active.current, {
        type: "release",
        nowMs: now(),
        holdNowMs: performance.now(),
      });
      setSession(active.current);
    };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, [seed]);
  const doseValid =
    dose.trim() !== "" &&
    Number.isFinite(Number(dose)) &&
    Number(dose) >= 10 &&
    Number(dose) <= 25;
  const prepare = () => {
    if (!doseValid || !Number.isFinite(Number(seed))) return;
    clock.current = {
      real: performance.now(),
      virtual: 0,
      speed: mode === "learn" ? speed : 1,
    };
    active.current = createSession(Number(dose), mode);
    fakeOrigin.current = null;
    lastFake.current = -Infinity;
    setSession(active.current);
  };
  const restart = () => {
    active.current = null;
    fakeOrigin.current = null;
    setSession(null);
  };
  const changeSpeed = (value: number) => {
    clock.current = { real: performance.now(), virtual: now(), speed: value };
    setSpeed(value);
  };
  const elapsed = session?.elapsedMs ?? 0;
  const step = session ? stepAt(session.recipe, elapsed) : null;
  const nextStep =
    session?.recipe.steps.find((item) => item.atMs > elapsed) ?? null;
  const curve = session ? expectedPoints(session.recipe, elapsed) : [];
  const expected = session ? expectedWeight(session.recipe, elapsed) : 0;
  const simulatePour = () => {
    if (active.current?.phase === "armed" && fakeOrigin.current === null)
      fakeOrigin.current = now();
  };
  const holdProgress =
    session?.holdAtMs === null || session?.holdAtMs === undefined
      ? 0
      : Math.min(1, session.holdElapsedMs / HOLD_MS);
  return {
    dose,
    setDose,
    mode,
    setMode,
    speed,
    changeSpeed,
    seed,
    setSeed,
    session,
    doseValid,
    prepare,
    restart,
    dispatch,
    releaseHold: () => dispatch("release"),
    step,
    expected,
    curve,
    nextStep,
    simulatePour,
    holdProgress,
  };
}
