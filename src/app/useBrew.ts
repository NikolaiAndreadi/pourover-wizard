import { useEffect, useRef, useState } from "react";
import {
  canArmLive,
  createSession,
  type Event,
  HOLD_MS,
  type Mode,
  type Session,
  updateSession,
} from "@/core/engine";
import { expectedPoints, expectedWeight, stepAt } from "@/core/recipe";
import { fakeSample } from "@/scale/fake";
import {
  bookooMiniEncoding,
  createLiveScale,
  createScaleTransport,
  type LiveSnapshot,
  supportsScaleConnection,
} from "./liveScale";
export type BrewModel = ReturnType<typeof useBrew>;
export function useBrew() {
  const [dose, setDose] = useState("15");
  const [mode, setMode] = useState<Mode>("timer");
  const [speed, setSpeed] = useState(1);
  const [seed, setSeed] = useState("42");
  const [liveState, setLiveState] = useState<LiveSnapshot>({
    status: "disconnected",
    pendingTare: false,
    error: "",
  });
  const smooth = useRef<{ atMs: number; grams: number }[]>([]);
  const live = useRef<ReturnType<typeof createLiveScale> | null>(null);
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
      if (
        (next.mode === "fake" || next.mode === "learn") &&
        atMs - lastFake.current >= 250
      ) {
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
  useEffect(() => {
    const route = () => {
      if (window.location.hash.startsWith("#/scale-lab"))
        live.current?.disconnect();
    };
    window.addEventListener("hashchange", route);
    return () => {
      window.removeEventListener("hashchange", route);
      live.current?.dispose();
    };
  }, []);
  useEffect(() => {
    if (session?.phase === "completed" || session?.phase === "cancelled") {
      live.current?.dispose();
      live.current = null;
    }
  }, [session?.phase]);
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
    if (mode === "live") {
      live.current?.dispose();
      setLiveState({ status: "disconnected", pendingTare: false, error: "" });
      const event = (type: "signalLost" | "tare") => {
        smooth.current = [];
        dispatch(type);
      };
      live.current = createLiveScale(
        createScaleTransport(),
        bookooMiniEncoding,
        now,
        (sample) => {
          if (active.current?.mode !== "live") return;
          active.current = updateSession(active.current, {
            type: "sample",
            nowMs: now(),
            holdNowMs: performance.now(),
            sample,
          });
          if (active.current.lastSample === sample)
            smooth.current = [
              ...smooth.current.filter(
                (value) => sample.atMs - value.atMs <= 500,
              ),
              sample,
            ].slice(-5);
          setSession(active.current);
        },
        () => event("signalLost"),
        () => event("tare"),
        setLiveState,
      );
    }
  };
  const restart = () => {
    live.current?.dispose();
    live.current = null;
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
  const sortedWeights = smooth.current
    .map((sample) => sample.grams)
    .sort((a, b) => a - b);
  const liveWeight = session?.lastSample
    ? (sortedWeights[Math.floor(sortedWeights.length / 2)] ??
      session.lastSample.grams)
    : null;
  return {
    liveWeight,
    liveState,
    liveSupported: supportsScaleConnection(),
    connectLive: () => live.current?.connect(),
    disconnectLive: () => live.current?.disconnect(),
    tareLive: () => live.current?.tare(),
    liveCanArm:
      session !== null &&
      canArmLive(session) &&
      liveState.status === "connected" &&
      !liveState.pendingTare,
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
