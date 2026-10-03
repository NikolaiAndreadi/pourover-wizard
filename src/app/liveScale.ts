import type { ScaleSample } from "@/core/scale";
import {
  BookooDecoder,
  type ConfirmedEncoding,
  encodeCommand,
  toSample,
  validateEncoding,
} from "@/scale/bookoo/codec";
import type { ScaleTransport } from "@/scale/contracts";
export interface LiveSnapshot {
  status: "disconnected" | "connecting" | "connected";
  pendingTare: boolean;
  error: string;
}
/** Only confirmed unit/sign mappings may turn BOOKOO notifications into brewing samples. */
export function createLiveScale(
  transport: ScaleTransport,
  encoding: ConfirmedEncoding,
  now: () => number,
  sample: (value: ScaleSample) => void,
  lost: () => void,
  tared: () => void,
  changed: (value: LiveSnapshot) => void,
) {
  validateEncoding(encoding);
  const decoder = new BookooDecoder();
  let generation = 0;
  let snapshot: LiveSnapshot = {
    status: "disconnected",
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
    generation++;
    transport.disconnect();
    clear();
    publish({ status: "disconnected", pendingTare: false });
  };
  return {
    async connect() {
      const mine = ++generation;
      transport.disconnect();
      clear();
      publish({ status: "connecting", pendingTare: false, error: "" });
      try {
        await transport.connect({
          onChunk(bytes) {
            if (mine !== generation) return;
            for (const frame of decoder.push(bytes)) {
              const value = toSample(frame, now(), encoding);
              if (value) sample(value);
              else {
                lost();
                publish({
                  error:
                    "Unconfirmed unit or sign; reading ignored. Check the scale and mapping.",
                });
              }
            }
          },
          onDisconnect() {
            if (mine !== generation) return;
            generation++;
            clear();
            publish({ status: "disconnected", pendingTare: false });
          },
        });
        if (mine === generation) publish({ status: "connected" });
      } catch (error) {
        if (mine !== generation) return;
        generation++;
        transport.disconnect();
        clear();
        publish({
          status: "disconnected",
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
export {
  createWebTransport,
  supportsScaleConnection,
} from "@/scale/transport/web";
