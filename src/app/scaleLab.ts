import {
  type BookooCommand,
  BookooDecoder,
  type BookooFrame,
  encodeCommand,
} from "@/scale/bookoo/codec";
import type { ScaleTransport } from "@/scale/contracts";
import {
  createRecorder,
  type RecordingMetadata,
} from "@/scale/recording/session";

export interface LabSnapshot {
  state: "idle" | "connecting" | "connected" | "disconnected";
  frame: BookooFrame | null;
  rejectedFrames: number;
  error: string;
  latestHex: string;
  eventCount: number;
  truncated: boolean;
}
export function createScaleLab(
  transport: ScaleTransport,
  metadata: RecordingMetadata,
  nowMs: () => number,
  changed: (snapshot: LabSnapshot) => void,
) {
  const decoder = new BookooDecoder();
  const recorder = createRecorder(metadata, "hardware", nowMs);
  let generation = 0;
  let connectedRecorded = false;
  const markConnected = () => {
    if (!connectedRecorded) {
      recorder.append({ kind: "connected" });
      connectedRecorded = true;
    }
  };
  let state: LabSnapshot = {
    state: "idle",
    frame: null,
    rejectedFrames: 0,
    error: "",
    latestHex: "",
    eventCount: 0,
    truncated: false,
  };
  const publish = () => {
    const record = recorder.stats();
    state = {
      ...state,
      eventCount: record.eventCount,
      truncated: record.truncated,
    };
    changed({ ...state });
  };
  const errorText = (error: unknown) =>
    (error instanceof Error ? error.message : "Scale operation failed.").slice(
      0,
      2000,
    );
  return {
    async connect() {
      const mine = ++generation;
      connectedRecorded = false;
      decoder.reset();
      state = { ...state, state: "connecting", error: "", frame: null };
      publish();
      try {
        await transport.connect({
          onChunk(bytes) {
            if (mine !== generation) return;
            markConnected();
            recorder.append({ kind: "notification", bytes: Array.from(bytes) });
            const frames = decoder.push(bytes);
            state = {
              ...state,
              frame: frames.at(-1) ?? state.frame,
              latestHex: Array.from(bytes.subarray(0, 64), (byte) =>
                byte.toString(16).padStart(2, "0"),
              ).join(" "),
              rejectedFrames: decoder.rejectedFrames,
            };
            publish();
          },
          onDisconnect() {
            if (mine !== generation) return;
            generation++;
            decoder.reset();
            recorder.append({ kind: "disconnected" });
            state = { ...state, state: "disconnected", frame: null };
            publish();
          },
        });
        if (mine !== generation) return;
        markConnected();
        state = { ...state, state: "connected" };
        publish();
      } catch (error) {
        if (mine !== generation) return;
        const text = errorText(error);
        recorder.append({ kind: "error", text });
        state = { ...state, state: "disconnected", error: text, frame: null };
        publish();
      }
    },
    disconnect() {
      generation++;
      transport.disconnect();
      decoder.reset();
      recorder.append({ kind: "disconnected" });
      state = { ...state, state: "disconnected", frame: null };
      publish();
    },
    async command(command: BookooCommand) {
      if (state.state !== "connected") return;
      const mine = generation;
      const bytes = encodeCommand(command);
      recorder.append({ kind: "command", bytes: Array.from(bytes) });
      publish();
      try {
        await transport.write(bytes);
      } catch (error) {
        if (mine !== generation) return;
        const text = errorText(error);
        recorder.append({ kind: "error", text });
        state = { ...state, error: text };
        publish();
      }
    },
    annotate(text: string) {
      if (!text.trim()) return;
      recorder.append({ kind: "annotation", text: text.trim().slice(0, 2000) });
      publish();
    },
    recording: recorder.snapshot,
    dispose() {
      generation++;
      transport.disconnect();
    },
  };
}

export {
  bookooUuids,
  type ConfirmedEncoding,
  toSample,
  validateEncoding,
} from "@/scale/bookoo/codec";
export { parseRecording } from "@/scale/recording/session";
export { replayBookoo } from "@/scale/replay/bookoo";
export {
  createScaleTransport,
  supportsScaleConnection,
} from "@/scale/transport";
