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
  type Recipe,
  stepAt,
} from "@/core/recipe";
import { recipeById, recipes } from "@/core/recipes";
import {
  type BrewMemory,
  createRememberedBrew,
} from "@/platform/rememberedBrew";
import { type Pace, paceHint } from "./pace";
import { useLiveScale } from "./useLiveScale";
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
export function useBrew(memory: BrewMemory = createRememberedBrew()) {
  const [recipeId, setRecipeId] = useState(() => rememberedRecipe(memory).id);
  const recipe = recipeById(recipeId);
  const [dose, setDoseInput] = useState(() => rememberedDose(memory, recipe));
  /** Chooses a recipe and shows its remembered or default dose. */
  const setRecipe = (id: string) => {
    const chosen = recipeById(id);
    memory.saveRecipe(chosen.id);
    setRecipeId(chosen.id);
    setDoseInput(rememberedDose(memory, chosen));
  };
  /** Edits the dose; a value valid for this recipe is remembered for it. */
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
  const apply = (event: Event) => {
    if (!active.current) return null;
    const wasBrewing = active.current.phase === "brewing";
    active.current = updateSession(active.current, event);
    if (active.current.phase === "cancelled" && !wasBrewing) {
      restart();
      return null;
    }
    setSession(active.current);
    return active.current;
  };
  const dispatch = (type: Event["type"]) => {
    if (!active.current || type === "sample") return;
    if ((type === "start" || type === "arm") && previewOpen.current) return;
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
  const goToStart = () => {
    previewOpen.current = false;
    setPreviewing(false);
    preview.current = 0;
    setPreviewIndex(0);
  };
  const browseStep = (delta: number) => {
    if (active.current?.phase !== "preparation") return;
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
    const clamped = Math.min(active.current.recipe.steps.length - 1, index);
    preview.current = clamped;
    setPreviewIndex(clamped);
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
  const doseValid = isValidDose(dose, recipe);
  const prepare = () => {
    if (!doseValid) return;
    clock.current = performance.now();
    goToStart();
    active.current = createSession(recipe, Number(dose), "timer");
    setSession(active.current);
    prepareLive();
  };
  const connected = live.liveState.status === "connected";
  useEffect(() => {
    const current = active.current;
    if (current?.phase !== "preparation") return;
    const mode: Mode = connected ? "live" : "timer";
    if (current.mode === mode) return;
    goToStart();
    active.current = createSession(recipe, Number(dose), mode, now());
    setSession(active.current);
  }, [connected]);
  const restart = () => {
    releaseLive();
    active.current = null;
    goToStart();
    setSession(null);
  };
  const canPreview = session?.phase === "preparation";
  const isPreviewing = canPreview && previewing;
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
    /** Pour pace against the ideal ramp while pouring with a scale; otherwise null. */
    pace,
    holdProgress,
    /** Done is available once brewing reaches the recipe's drawdown. */
    canFinish:
      session?.phase === "brewing" &&
      session.elapsedMs >= drawdownStartMs(session.recipe),
  };
}
