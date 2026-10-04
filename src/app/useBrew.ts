import { useEffect, useEffectEvent, useRef, useState } from "react";
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
  type Recipe,
  stepAt,
} from "@/core/recipe";
import { recipeById, recipes } from "@/core/recipes";
import {
  type BrewHistory,
  type BrewRecord,
  createBrewHistory,
} from "@/platform/brewHistory";
import {
  type BrewMemory,
  createRememberedBrew,
} from "@/platform/rememberedBrew";
import { type Pace, paceHint } from "./pace";
import { useLiveScale } from "./useLiveScale";
import { useWakeLock } from "./useWakeLock";
export type BrewModel = ReturnType<typeof useBrew>;
const defaultRecipe = recipeById(recipes[0]?.id ?? "");
const isValidDose = (value: string, recipe: Recipe) =>
  value.trim() !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) >= recipe.minDoseGrams &&
  Number(value) <= recipe.maxDoseGrams;
/** The remembered recipe, or the first recipe when none or an unknown one. */
const rememberedRecipe = (memory: BrewMemory): Recipe =>
  recipes.find((value) => value.id === memory.load().recipeId) ?? defaultRecipe;
/** The recipe's remembered dose, or its own when missing or out of range. */
const rememberedDose = (memory: BrewMemory, recipe: Recipe) => {
  const grams = memory.load().doses[recipe.id];
  return grams !== undefined && isValidDose(String(grams), recipe)
    ? String(grams)
    : String(recipe.doseGrams);
};
const newId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
/** A saved brew as the completed session it was, for the shared summary. */
const recordSession = (record: BrewRecord): Session => ({
  ...createSession(record.recipe, record.recipe.doseGrams, record.mode),
  phase: "completed",
  elapsedMs: record.elapsedMs,
  samples: record.samples,
  pouredGrams: record.pouredGrams,
});
export function useBrew(
  memory: BrewMemory = createRememberedBrew(),
  history: BrewHistory = createBrewHistory(),
) {
  const [recipeId, setRecipeId] = useState(() => rememberedRecipe(memory).id);
  const recipe = recipeById(recipeId);
  const [dose, setDoseInput] = useState(() => rememberedDose(memory, recipe));
  const setRecipe = (id: string) => {
    const chosen = recipeById(id);
    memory.saveRecipe(chosen.id);
    setRecipeId(chosen.id);
    setDoseInput(rememberedDose(memory, chosen));
  };
  const setDose = (value: string) => {
    setDoseInput(value);
    if (isValidDose(value, recipe)) memory.saveDose(recipe.id, Number(value));
  };
  const [previewIndex, setPreviewIndex] = useState(0);
  const preview = useRef(0);
  const [previewing, setPreviewing] = useState(false);
  const previewOpen = useRef(false);
  const [session, setSession] = useState<Session | null>(null);
  const clock = useRef(performance.now());
  const active = useRef<Session | null>(null);
  const now = () => performance.now() - clock.current;
  const [records, setRecords] = useState(() => history.load());
  const [historyOpen, setHistoryOpen] = useState(false);
  // A saved brew being reviewed, mirrored in a ref for the step browser guards.
  const [viewed, setViewed] = useState<Session | null>(null);
  const viewing = useRef<Session | null>(null);
  const save = (done: Session) => {
    history.add({
      id: newId(),
      completedAt: new Date().toISOString(),
      mode: done.mode,
      recipe: done.recipe,
      elapsedMs: done.elapsedMs,
      pouredGrams: done.pouredGrams,
      samples: done.samples,
    });
    setRecords(history.load());
  };
  const apply = (event: Event) => {
    if (!active.current) return null;
    const wasBrewing = active.current.phase === "brewing";
    active.current = updateSession(active.current, event);
    if (active.current.phase === "cancelled" && !wasBrewing) {
      restart();
      return null;
    }
    if (active.current.phase === "completed" && wasBrewing)
      save(active.current);
    setSession(active.current);
    return active.current;
  };
  const dispatch = (type: Event["type"]) => {
    if (!active.current || type === "sample") return;
    if ((type === "start" || type === "arm") && previewOpen.current) return;
    apply({ type, nowMs: now(), holdNowMs: performance.now() });
  };
  const { resetLive, ...live } = useLiveScale(session, {
    active,
    now,
    dispatch,
    apply,
  });
  useWakeLock(
    session?.phase === "preparation" ||
      session?.phase === "armed" ||
      session?.phase === "brewing",
  );
  const onTick = useEffectEvent(() =>
    apply({ type: "tick", nowMs: now(), holdNowMs: performance.now() }),
  );
  const onLeave = useEffectEvent(() =>
    apply({ type: "release", nowMs: now(), holdNowMs: performance.now() }),
  );
  useEffect(() => {
    const timer = window.setInterval(() => onTick(), 100);
    const release = () => onLeave();
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, []);
  const goToStart = () => {
    previewOpen.current = false;
    setPreviewing(false);
    preview.current = 0;
    setPreviewIndex(0);
  };
  /** Steps can be browsed before a brew and on a finished one, live or saved. */
  const browsable = () => {
    const current = viewing.current ?? active.current;
    return current?.phase === "preparation" || current?.phase === "completed"
      ? current
      : null;
  };
  const browseStep = (delta: number) => {
    const current = browsable();
    if (!current) return;
    if (!previewOpen.current) {
      if (delta <= 0) return;
      previewOpen.current = true;
      setPreviewing(true);
      preview.current = 0;
      setPreviewIndex(0);
      return;
    }
    const index = preview.current + delta;
    if (index < 0) {
      goToStart();
      return;
    }
    const clamped = Math.min(current.recipe.steps.length - 1, index);
    preview.current = clamped;
    setPreviewIndex(clamped);
  };
  const onKey = useEffectEvent((event: KeyboardEvent) => {
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
    if (!browsable() || document.querySelector("[role=dialog], dialog[open]"))
      return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    browseStep(event.key === "ArrowLeft" ? -1 : 1);
  });
  useEffect(() => {
    const browse = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", browse);
    return () => window.removeEventListener("keydown", browse);
  }, []);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = useEffectEvent((event: TouchEvent) => {
    const target = event.target;
    const touch = event.touches.length === 1 ? event.touches[0] : undefined;
    swipeStart.current =
      touch &&
      !(
        target instanceof Element &&
        target.closest("input, textarea, select, .hold, .cancel")
      )
        ? { x: touch.clientX, y: touch.clientY }
        : null;
  });
  const onTouchEnd = useEffectEvent((event: TouchEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch || !browsable()) return;
    if (document.querySelector("[role=dialog], dialog[open]")) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return;
    browseStep(dx < 0 ? 1 : -1);
  });
  useEffect(() => {
    const start = (event: TouchEvent) => onTouchStart(event);
    const end = (event: TouchEvent) => onTouchEnd(event);
    const cancel = () => {
      swipeStart.current = null;
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", cancel);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", cancel);
    };
  }, []);
  const doseValid = isValidDose(dose, recipe);
  const prepare = () => {
    if (!doseValid) return;
    clock.current = performance.now();
    goToStart();
    // A scale connected earlier makes the new brew scale assist from the start.
    active.current = createSession(
      recipe,
      Number(dose),
      live.liveState.status === "connected" ? "live" : "timer",
    );
    setSession(active.current);
    resetLive();
  };
  const connected = live.liveState.status === "connected";
  const matchMode = useEffectEvent((isConnected: boolean) => {
    const current = active.current;
    if (current?.phase !== "preparation") return;
    const mode: Mode = isConnected ? "live" : "timer";
    if (current.mode === mode) return;
    goToStart();
    active.current = createSession(recipe, Number(dose), mode, now());
    setSession(active.current);
  });
  useEffect(() => {
    matchMode(connected);
  }, [connected]);
  const [armPending, setArmPending] = useState(false);
  const toggleArm = () => {
    const current = active.current;
    if (current?.mode !== "live") return;
    if (current.phase === "armed") {
      dispatch("disarm");
      return;
    }
    if (armPending) {
      setArmPending(false);
      return;
    }
    if (live.liveCanArm) {
      dispatch("arm");
      return;
    }
    setArmPending(true);
    if (!current.tared) live.tareLive();
  };
  const { pendingTare } = live.liveState;
  const arm = useEffectEvent(() => dispatch("arm"));
  useEffect(() => {
    if (!armPending) return;
    const tareFailed = !session?.tared && !pendingTare;
    if (!connected || session?.phase !== "preparation" || tareFailed) {
      setArmPending(false);
      return;
    }
    if (!live.liveCanArm || previewing) return;
    arm();
    setArmPending(false);
  }, [
    armPending,
    connected,
    pendingTare,
    live.liveCanArm,
    session,
    previewing,
  ]);
  const restart = () => {
    resetLive();
    active.current = null;
    goToStart();
    setSession(null);
  };
  const openBrew = (id: string) => {
    const record = records.find((item) => item.id === id);
    if (!record) return;
    goToStart();
    viewing.current = recordSession(record);
    setViewed(viewing.current);
  };
  const closeBrew = () => {
    goToStart();
    viewing.current = null;
    setViewed(null);
  };
  const closeHistory = () => {
    closeBrew();
    setHistoryOpen(false);
  };
  const deleteBrew = (id: string) => {
    history.remove(id);
    setRecords(history.load());
  };
  const clearHistory = () => {
    history.clear();
    setRecords(history.load());
  };
  const shown = viewed ?? session;
  const isPreviewing =
    (shown?.phase === "preparation" || shown?.phase === "completed") &&
    previewing;
  const displayElapsedMs = isPreviewing
    ? (shown.recipe.steps[previewIndex]?.atMs ?? 0)
    : (shown?.elapsedMs ?? 0);
  const step = shown ? stepAt(shown.recipe, displayElapsedMs) : null;
  const nextStep =
    shown?.recipe.steps.find((item) => item.atMs > displayElapsedMs) ?? null;
  const curve = shown ? expectedPoints(shown.recipe, displayElapsedMs) : [];
  const expected = shown ? expectedWeight(shown.recipe, displayElapsedMs) : 0;
  // Hysteresis state for the pour pace hint; reset whenever the pour changes.
  const paceState = useRef<{ pourAtMs: number | null; pace: Pace }>({
    pourAtMs: null,
    pace: "steady",
  });
  const pouring =
    session?.phase === "brewing" &&
    session.mode === "live" &&
    step?.action === "pour" &&
    nextStep !== null &&
    live.liveWeight !== null;
  if (!pouring) paceState.current = { pourAtMs: null, pace: "steady" };
  else if (session && step && nextStep && live.liveWeight !== null) {
    const index = session.recipe.steps.indexOf(step);
    const from =
      (session.recipe.steps[index - 1]?.targetFraction ?? 0) *
      session.recipe.waterGrams;
    const to = step.targetFraction * session.recipe.waterGrams;
    const gramsPerSecond = ((to - from) * 1000) / (nextStep.atMs - step.atMs);
    const previous =
      paceState.current.pourAtMs === step.atMs
        ? paceState.current.pace
        : "steady";
    paceState.current = {
      pourAtMs: step.atMs,
      pace: paceHint(previous, expected, live.liveWeight, gramsPerSecond),
    };
  }
  const pace: Pace | null = pouring ? paceState.current.pace : null;
  const holdProgress =
    session?.holdAtMs === null || session?.holdAtMs === undefined
      ? 0
      : Math.min(1, session.holdElapsedMs / HOLD_MS);
  return {
    ...live,
    recipes,
    recipe,
    setRecipe,
    dose,
    setDose,
    previewIndex,
    displayElapsedMs,
    isPreviewing,
    browseStep,
    goToStart,
    session: shown,
    /** Saved brews, newest first. */
    history: records,
    historyOpen,
    showHistory: () => setHistoryOpen(true),
    closeHistory,
    reviewing: viewed !== null,
    openBrew,
    closeBrew,
    deleteBrew,
    clearHistory,
    doseValid,
    prepare,
    restart,
    dispatch,
    toggleArm,
    armPending,
    step,
    expected,
    curve,
    nextStep,
    /** Pour pace against the ideal ramp while pouring with a scale; otherwise null. */
    pace,
    holdProgress,
    canFinish:
      session?.phase === "brewing" &&
      session.elapsedMs >= drawdownStartMs(session.recipe),
  };
}
