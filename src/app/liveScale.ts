import type { ScaleSample } from "@/core/scale";
import {
  BookooDecoder,
  type ConfirmedEncoding,
  encodeCommand,
  toSample,
  validateEncoding,
} from "@/scale/bookoo/codec";
import type {
  ConnectStep,
  ScaleTransport,
  ScanCandidate,
} from "@/scale/contracts";
import { modelName, type ScaleModel } from "@/scale/supported";
export interface LiveSnapshot {
  status: "disconnected" | "connecting" | "connected";
  /** While connecting: the chooser is open, or a known scale is being reached. */
  progress: ConnectStep | null;
  /** The supported model identified from the connected device's services. */
  model: ScaleModel | null;
  pendingTare: boolean;
  error: string;
  /** A filtered attempt failed or was cancelled, so an unfiltered pick is worth offering. */
  offerAllDevices: boolean;
  /** An in-app scan is collecting devices (iOS only). */
  scanning: boolean;
  /** Devices seen by the in-app scan, strongest signal first. */
  candidates: readonly ScanCandidate[];
}
/** The one protocol this adapter decodes; other registry protocols are refused. */
const DECODED_PROTOCOL: ScaleModel["protocol"] = "bookoo-mini";
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
    model: null,
    pendingTare: false,
    error: "",
    offerAllDevices: false,
    scanning: false,
    candidates: [],
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
    publish({
      status: "disconnected",
      progress: null,
      model: null,
      pendingTare: false,
      scanning: false,
    });
  };
  /** Runs one connection attempt; failures leave the all-devices offer open. */
  const attempt = async (
    run: (observers: Parameters<ScaleTransport["connect"]>[0]) => Promise<void>,
  ) => {
    const mine = ++generation;
    transport.disconnect();
    clear();
    publish({
      status: "connecting",
      progress: null,
      model: null,
      pendingTare: false,
      error: "",
      scanning: false,
    });
    try {
      await run({
        onProgress(step) {
          if (mine === generation && snapshot.status === "connecting")
            publish({ progress: step });
        },
        onIdentified(model) {
          if (mine === generation) publish({ model });
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
            model: null,
            pendingTare: false,
          });
        },
      });
      if (mine !== generation) return;
      const model = snapshot.model;
      if (model && model.protocol !== DECODED_PROTOCOL)
        throw new Error(
          `Unsupported scale protocol "${String(model.protocol)}" on ${modelName(model)}.`,
        );
      publish({
        status: "connected",
        progress: null,
        offerAllDevices: false,
        candidates: [],
      });
    } catch (error) {
      if (mine !== generation) return;
      generation++;
      transport.disconnect();
      clear();
      publish({
        status: "disconnected",
        progress: null,
        model: null,
        pendingTare: false,
        offerAllDevices: true,
        error: error instanceof Error ? error.message : "Connection failed.",
      });
    }
  };
  return {
    /** Remembered scale first, then the chooser filtered to supported scales. */
    connect: () => attempt((observers) => transport.connect(observers)),
    /** Everything in range: the platform chooser, or an in-app scan where the app can list devices. */
    async connectAll() {
      const scan = transport.scan;
      if (!scan) {
        await attempt((observers) => transport.connectAll(observers));
        return;
      }
      const mine = ++generation;
      transport.disconnect();
      clear();
      publish({
        status: "disconnected",
        progress: null,
        model: null,
        pendingTare: false,
        error: "",
        scanning: true,
        candidates: [],
      });
      try {
        await scan.start({
          onCandidates(list) {
            if (mine === generation) publish({ candidates: list });
          },
        });
        if (mine === generation) publish({ scanning: false });
      } catch (error) {
        if (mine !== generation) return;
        generation++;
        publish({
          scanning: false,
          error: error instanceof Error ? error.message : "Scan failed.",
        });
      }
    },
    /** Connects to a device listed by the in-app scan. */
    async pickCandidate(id: string) {
      const scan = transport.scan;
      const candidate = snapshot.candidates.find((value) => value.id === id);
      if (!scan || !candidate) return;
      await attempt((observers) => scan.connect(candidate, observers));
    },
    /** Ends an in-app scan early, keeping the devices found so far. */
    stopScan() {
      if (!snapshot.scanning) return;
      generation++;
      transport.disconnect();
      publish({ scanning: false });
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
  ScanCandidate,
} from "@/scale/contracts";
export { modelName, type ScaleModel, supportedScales } from "@/scale/supported";
export {
  createScaleTransport,
  supportsScaleConnection,
} from "@/scale/transport";
