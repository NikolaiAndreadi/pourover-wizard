import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { canArmLive, type Event, type Session } from "@/core/engine";
import type { ScaleSample } from "@/core/scale";
import { createRememberedDevice } from "@/platform/rememberedDevice";
import {
  bookooMiniEncoding,
  createLiveScale,
  createScaleTransport,
  type LiveSnapshot,
  type RememberedDevice,
  type RememberedScale,
  supportedScales,
  supportsScaleConnection,
} from "./liveScale";

const scaleMemory = createRememberedDevice();
const disconnected: LiveSnapshot = {
  status: "disconnected",
  progress: null,
  model: null,
  pendingTare: false,
  error: "",
  offerAllDevices: false,
  scanning: false,
  candidates: [],
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
/** A live session that still takes readings: before and during the brew. */
function streaming(session: Session | null): session is Session {
  return (
    session !== null &&
    session.mode === "live" &&
    (session.phase === "preparation" ||
      session.phase === "armed" ||
      session.phase === "brewing")
  );
}
/** Brew session access the live connection needs from its owner. */
export interface LiveBrew {
  active: RefObject<Session | null>;
  now: () => number;
  dispatch: (type: Exclude<Event["type"], "sample">) => void;
  /** Applies an event to the active session and publishes the result. */
  apply: (event: Event) => Session | null;
}
/**
 * Owns the one BOOKOO connection for the app's lifetime. Brews come and go
 * while the scale stays connected; only Disconnect or teardown releases it.
 */
export function useLiveScale(session: Session | null, brew: LiveBrew) {
  const [liveState, setLiveState] = useState<LiveSnapshot>(disconnected);
  const [disconnectNotice, setDisconnectNotice] = useState(false);
  /** The newest reading while no brew is taking samples, so the header still shows weight. */
  const [idleSample, setIdleSample] = useState<ScaleSample | null>(null);
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
  // The connection is created once, so its callbacks read the latest brew through a ref.
  const owner = useRef(brew);
  owner.current = brew;
  useEffect(() => {
    const event = (type: "signalLost" | "tare") => {
      smooth.current = [];
      setIdleSample(null);
      owner.current.dispatch(type);
    };
    live.current = createLiveScale(
      createScaleTransport(memory),
      bookooMiniEncoding,
      () => owner.current.now(),
      (sample) => {
        const current = owner.current.active.current;
        if (!streaming(current)) {
          smooth.current = pushDisplayReading(smooth.current, sample);
          setIdleSample(sample);
          return;
        }
        const next = owner.current.apply({
          type: "sample",
          nowMs: owner.current.now(),
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
        const current = owner.current.active.current;
        if (
          current?.mode !== "live" ||
          (current.phase !== "brewing" && current.phase !== "armed")
        )
          return;
        owner.current.dispatch("disconnect");
        setDisconnectNotice(true);
      },
    );
    return () => {
      live.current?.dispose();
      live.current = null;
    };
  }, [memory]);
  /** Clears per-brew display state; the connection itself carries over. */
  const resetLive = () => {
    setDisconnectNotice(false);
    smooth.current = [];
  };
  return {
    /** Prepares display state for a new brew without touching the connection. */
    prepareLive: resetLive,
    /** Clears display state when a brew is discarded without touching the connection. */
    resetLive,
    disconnectNotice,
    dismissDisconnectNotice: () => setDisconnectNotice(false),
    liveWeight: displayWeight(
      smooth.current,
      streaming(session) ? session.lastSample : idleSample,
    ),
    liveState,
    liveSupported: supportsScaleConnection(),
    /** The scale a later connection tries before opening the chooser. */
    rememberedScale,
    forgetScale: () => memory.clear(),
    connectLive: () => live.current?.connect(),
    /** Everything in range: the browser's chooser, or the in-app list on iOS. */
    connectAllLive: () => live.current?.connectAll(),
    pickCandidate: (id: string) => live.current?.pickCandidate(id),
    stopScanLive: () => live.current?.stopScan(),
    /** Registry entries shown on the ready screen; only verified ones were seen on hardware. */
    supportedScales,
    disconnectLive: () => live.current?.disconnect(),
    tareLive: () => live.current?.tare(),
    liveCanArm:
      session !== null &&
      canArmLive(session) &&
      liveState.status === "connected" &&
      !liveState.pendingTare,
  };
}
