import { useEffect, useRef, useState } from "react";
import {
  createSession,
  type Event,
  HOLD_MS,
  type Mode,
  type Session,
  updateSession,
} from "@/core/engine";
import {
  drawdownStartMs,
  expectedPoints,
  expectedWeight,
  stepAt,
} from "@/core/recipe";
import { routeFromHash } from "./routes";
import { useLiveScale } from "./useLiveScale";
export type BrewModel = ReturnType<typeof useBrew>;
export function useBrew() {
  const [dose, setDose] = useState("15");
  const [mode, setMode] = useState<Mode>("timer");
  const [previewIndex, setPreviewIndex] = useState(0);
  const preview = useRef(0);
  const [session, setSession] = useState<Session | null>(null);
  const clock = useRef(performance.now());
  const active = useRef<Session | null>(null);
  const now = () => performance.now() - clock.current;
  const apply = (event: Event) => {
    if (!active.current) return null;
    active.current = updateSession(active.current, event);
    setSession(active.current);
    return active.current;
  };
  const dispatch = (type: Event["type"]) => {
    if (!active.current || type === "sample") return;
    if ((type === "start" || type === "arm") && preview.current > 0) return;
    apply({ type, nowMs: now(), holdNowMs: performance.now() });
  };
  const { prepareLive, releaseLive, ...live } = useLiveScale(session, {
    active,
    now,
    dispatch,
    apply,
  });
  useEffect(() => {
    const timer = window.setInterval(
      () => apply({ type: "tick", nowMs: now(), holdNowMs: performance.now() }),
      100,
    );
    const release = () =>
      apply({ type: "release", nowMs: now(), holdNowMs: performance.now() });
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, []);
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
    setSession(active.current);
    prepareLive(mode);
  };
  const restart = () => {
    releaseLive();
    active.current = null;
    goToStart();
    setSession(null);
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
  return {
    ...live,
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
    /** Done is available once brewing reaches the recipe's drawdown. */
    canFinish:
      session?.phase === "brewing" &&
      session.elapsedMs >= drawdownStartMs(session.recipe),
  };
}
