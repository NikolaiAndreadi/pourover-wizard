import type { ScaleSample } from "@/core/scale";
import {
  BookooDecoder,
  type ConfirmedEncoding,
  encodeCommand,
  toSample,
  validateEncoding,
} from "@/scale/bookoo/codec";
import type { ConnectStep, ScaleTransport } from "@/scale/contracts";
export interface LiveSnapshot {
  status: "disconnected" | "connecting" | "connected";
  /** While connecting: the chooser is open, or a known scale is being reached. */
  progress: ConnectStep | null;
  pendingTare: boolean;
  error: string;
}
/** Only matching unit/sign codes may turn BOOKOO notifications into brewing samples. */
export function createLiveScale(
  transport: ScaleTransport,
  encoding: ConfirmedEncoding,
  now: () => number,
  sample: (value: ScaleSample) => void,
  lost: () => void,
  tared: () => void,
  changed: (value: LiveSnapshot) => void,
  disconnected: () => void = () => {},
) {
  validateEncoding(encoding);
  const decoder = new BookooDecoder();
  let generation = 0;
  let snapshot: LiveSnapshot = {
    status: "disconnected",
    progress: null,
    pendingTare: false,
    error: "",
  };
  const publish = (value: Partial<LiveSnapshot>) => {
    snapshot = { ...snapshot, ...value };
    changed(snapshot);
  };
  const clear = () => {
    decoder.reset();
    lost();
  };
  const disconnect = () => {
    const wasConnected = snapshot.status === "connected";
    generation++;
    transport.disconnect();
    if (wasConnected) disconnected();
    clear();
    publish({ status: "disconnected", progress: null, pendingTare: false });
  };
  return {
    async connect() {
      const mine = ++generation;
      transport.disconnect();
      clear();
      publish({
        status: "connecting",
        progress: null,
        pendingTare: false,
        error: "",
      });
      try {
        await transport.connect({
          onProgress(step) {
            if (mine === generation && snapshot.status === "connecting")
              publish({ progress: step });
          },
          onChunk(bytes) {
            if (mine !== generation) return;
            for (const frame of decoder.push(bytes)) {
              const value = toSample(frame, now(), encoding);
              if (value) sample(value);
              else {
                lost();
                publish({
                  error:
                    "Unsupported scale reading. Check that the scale is set to grams.",
                });
              }
            }
          },
          onDisconnect() {
            if (mine !== generation) return;
            generation++;
            if (snapshot.status === "connected") disconnected();
            clear();
            publish({
              status: "disconnected",
              progress: null,
              pendingTare: false,
            });
          },
        });
        if (mine === generation)
          publish({ status: "connected", progress: null });
      } catch (error) {
        if (mine !== generation) return;
        generation++;
        transport.disconnect();
        clear();
        publish({
          status: "disconnected",
          progress: null,
          pendingTare: false,
          error: error instanceof Error ? error.message : "Connection failed.",
        });
      }
    },
    async tare() {
      if (snapshot.status !== "connected" || snapshot.pendingTare) return;
      const mine = generation;
      clear();
      publish({ pendingTare: true, error: "" });
      try {
        await transport.write(encodeCommand("tare"));
        if (mine !== generation) return;
        // A completed write allows readiness checking; fresh zero readings are still required.
        tared();
        publish({ pendingTare: false });
      } catch (error) {
        if (mine !== generation) return;
        clear();
        publish({
          pendingTare: false,
          error: error instanceof Error ? error.message : "Tare failed.",
        });
      }
    },
    disconnect,
    dispose() {
      generation++;
      transport.disconnect();
      decoder.reset();
    },
  };
}
export type { ConfirmedEncoding } from "@/scale/bookoo/codec";
export { bookooMiniEncoding } from "@/scale/bookoo/codec";
export type {
  ConnectStep,
  RememberedDevice,
  RememberedScale,
} from "@/scale/contracts";
export {
  createScaleTransport,
  supportsScaleConnection,
} from "@/scale/transport";
