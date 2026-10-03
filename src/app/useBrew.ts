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
import {
  bookooMiniEncoding,
  createLiveScale,
  createScaleTransport,
  type LiveSnapshot,
  supportsScaleConnection,
} from "./liveScale";
import { routeFromHash } from "./routes";
export type BrewModel = ReturnType<typeof useBrew>;
export function useBrew() {
  const [dose, setDose] = useState("15");
  const [mode, setMode] = useState<Mode>("timer");
  const [previewIndex, setPreviewIndex] = useState(0);
  const preview = useRef(0);
  const [liveState, setLiveState] = useState<LiveSnapshot>({
    status: "disconnected",
    pendingTare: false,
    error: "",
  });
  const smooth = useRef<{ atMs: number; grams: number }[]>([]);
  const live = useRef<ReturnType<typeof createLiveScale> | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [disconnectNotice, setDisconnectNotice] = useState(false);
  const clock = useRef(performance.now());
  const active = useRef<Session | null>(null);
  const now = () => performance.now() - clock.current;
  const dispatch = (type: Event["type"]) => {
    if (!active.current || type === "sample") return;
    if ((type === "start" || type === "arm") && preview.current > 0) return;
    active.current = updateSession(active.current, {
      type,
      nowMs: now(),
      holdNowMs: performance.now(),
    });
    setSession(active.current);
  };
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!active.current) return;
      const atMs = now();
      const next = updateSession(active.current, {
        type: "tick",
        nowMs: atMs,
        holdNowMs: performance.now(),
      });
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
  }, []);
  useEffect(() => () => live.current?.dispose(), []);
  const browseStep = (delta: number) => {
    if (active.current?.phase !== "preparation") return;
    const index = Math.max(
      0,
      Math.min(active.current.recipe.steps.length - 1, preview.current + delta),
    );
    preview.current = index;
    setPreviewIndex(index);
  };
  const goToStart = () => {
    preview.current = 0;
    setPreviewIndex(0);
  };
  useEffect(() => {
    const browse = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.defaultPrevented
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [contenteditable]"))
      )
        return;
      if (
        active.current?.phase !== "preparation" ||
        routeFromHash(window.location.hash) !== "home" ||
        document.querySelector("[role=dialog], dialog[open]")
      )
        return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      browseStep(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", browse);
    return () => window.removeEventListener("keydown", browse);
  }, []);
  useEffect(() => {
    if (
      session?.phase === "completed" ||
      session?.phase === "cancelled" ||
      session?.phase === "interrupted"
    ) {
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
    if (!doseValid) return;
    clock.current = performance.now();
    goToStart();
    active.current = createSession(Number(dose), mode);
    setDisconnectNotice(false);
    smooth.current = [];
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
        () => {
          if (
            active.current?.mode !== "live" ||
            (active.current.phase !== "brewing" &&
              active.current.phase !== "armed")
          )
            return;
          dispatch("disconnect");
          setDisconnectNotice(true);
        },
      );
    }
  };
  const restart = () => {
    live.current?.dispose();
    live.current = null;
    active.current = null;
    goToStart();
    setSession(null);
    setDisconnectNotice(false);
  };
  const canPreview = session?.phase === "preparation";
  const isPreviewing = canPreview && previewIndex > 0;
  const displayElapsedMs = canPreview
    ? (session.recipe.steps[previewIndex]?.atMs ?? 0)
    : (session?.elapsedMs ?? 0);
  const step = session ? stepAt(session.recipe, displayElapsedMs) : null;
  const nextStep =
    session?.recipe.steps.find((item) => item.atMs > displayElapsedMs) ?? null;
  const curve = session ? expectedPoints(session.recipe, displayElapsedMs) : [];
  const expected = session
    ? expectedWeight(session.recipe, displayElapsedMs)
    : 0;
  const holdProgress =
    session?.holdAtMs === null || session?.holdAtMs === undefined
      ? 0
      : Math.min(1, session.holdElapsedMs / HOLD_MS);
  const sortedWeights = smooth.current
    .map((sample) => sample.grams)
    .sort((a, b) => a - b);
  const liveWeight = session?.lastSample
    ? Math.max(
        0,
        sortedWeights[Math.floor(sortedWeights.length / 2)] ??
          session.lastSample.grams,
      )
    : null;
  return {
    disconnectNotice,
    dismissDisconnectNotice: () => setDisconnectNotice(false),
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
    previewIndex,
    displayElapsedMs,
    isPreviewing,
    canPreview,
    browseStep,
    goToStart,
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
    holdProgress,
  };
}
