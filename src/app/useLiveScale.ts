import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { canArmLive, type Event, type Mode, type Session } from "@/core/engine";
import type { ScaleSample } from "@/core/scale";
import { createRememberedDevice } from "@/platform/rememberedDevice";
import {
  bookooMiniEncoding,
  createLiveScale,
  createScaleTransport,
  type LiveSnapshot,
  type RememberedDevice,
  type RememberedScale,
  supportsScaleConnection,
} from "./liveScale";

const scaleMemory = createRememberedDevice();
const disconnected: LiveSnapshot = {
  status: "disconnected",
  progress: null,
  pendingTare: false,
  error: "",
};
/** Display-only median buffer: readings from the last half-second, at most five. */
export function pushDisplayReading(
  buffer: readonly ScaleSample[],
  sample: ScaleSample,
): ScaleSample[] {
  return [
    ...buffer.filter((value) => sample.atMs - value.atMs <= 500),
    sample,
  ].slice(-5);
}
/** Median of the display buffer, falling back to the latest reading; never negative. */
export function displayWeight(
  buffer: readonly ScaleSample[],
  latest: ScaleSample | null,
): number | null {
  if (!latest) return null;
  const sorted = buffer.map((sample) => sample.grams).sort((a, b) => a - b);
  return Math.max(0, sorted[Math.floor(sorted.length / 2)] ?? latest.grams);
}
/** Brew session access the live connection needs from its owner. */
export interface LiveBrew {
  active: RefObject<Session | null>;
  now: () => number;
  dispatch: (type: Exclude<Event["type"], "sample">) => void;
  /** Applies an event to the active session and publishes the result. */
  apply: (event: Event) => Session | null;
}
/** Owns the BOOKOO connection for one prepared live brew. */
export function useLiveScale(session: Session | null, brew: LiveBrew) {
  const [liveState, setLiveState] = useState<LiveSnapshot>(disconnected);
  const [disconnectNotice, setDisconnectNotice] = useState(false);
  const [rememberedScale, setRememberedScale] =
    useState<RememberedScale | null>(() => scaleMemory.load());
  // Tracks saves and forgets so About can offer Forget scale only when relevant.
  const memory = useMemo<RememberedDevice>(
    () => ({
      load: () => scaleMemory.load(),
      save(value) {
        scaleMemory.save(value);
        setRememberedScale(scaleMemory.load());
      },
      clear() {
        scaleMemory.clear();
        setRememberedScale(null);
      },
    }),
    [],
  );
  const smooth = useRef<ScaleSample[]>([]);
  const live = useRef<ReturnType<typeof createLiveScale> | null>(null);
  const release = () => {
    live.current?.dispose();
    live.current = null;
  };
  useEffect(() => () => live.current?.dispose(), []);
  useEffect(() => {
    if (
      session?.phase === "completed" ||
      session?.phase === "cancelled" ||
      session?.phase === "interrupted"
    )
      release();
  }, [session?.phase]);
  /** Resets display state for a newly prepared brew and, in live mode, a fresh connection. */
  const prepareLive = (mode: Mode) => {
    setDisconnectNotice(false);
    smooth.current = [];
    if (mode !== "live") return;
    live.current?.dispose();
    setLiveState(disconnected);
    const event = (type: "signalLost" | "tare") => {
      smooth.current = [];
      brew.dispatch(type);
    };
    live.current = createLiveScale(
      createScaleTransport(memory),
      bookooMiniEncoding,
      brew.now,
      (sample) => {
        if (brew.active.current?.mode !== "live") return;
        const next = brew.apply({
          type: "sample",
          nowMs: brew.now(),
          holdNowMs: performance.now(),
          sample,
        });
        if (next?.lastSample === sample)
          smooth.current = pushDisplayReading(smooth.current, sample);
      },
      () => event("signalLost"),
      () => event("tare"),
      setLiveState,
      () => {
        const current = brew.active.current;
        if (
          current?.mode !== "live" ||
          (current.phase !== "brewing" && current.phase !== "armed")
        )
          return;
        brew.dispatch("disconnect");
        setDisconnectNotice(true);
      },
    );
  };
  /** Releases the connection and notice when the brew is discarded. */
  const releaseLive = () => {
    release();
    setDisconnectNotice(false);
  };
  return {
    prepareLive,
    releaseLive,
    disconnectNotice,
    dismissDisconnectNotice: () => setDisconnectNotice(false),
    liveWeight: displayWeight(smooth.current, session?.lastSample ?? null),
    liveState,
    liveSupported: supportsScaleConnection(),
    /** The scale a later connection tries before opening the chooser. */
    rememberedScale,
    forgetScale: () => memory.clear(),
    connectLive: () => live.current?.connect(),
    disconnectLive: () => live.current?.disconnect(),
    tareLive: () => live.current?.tare(),
    liveCanArm:
      session !== null &&
      canArmLive(session) &&
      liveState.status === "connected" &&
      !liveState.pendingTare,
  };
}
