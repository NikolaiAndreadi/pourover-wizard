import type { ScaleSample } from "@/core/scale";
import {
  BookooDecoder,
  type BookooFrame,
  toSample,
} from "@/scale/bookoo/codec";
import type { RawRecording } from "@/scale/recording/session";

export function replayBookoo(recording: RawRecording): {
  frames: Array<{ atMs: number; frame: BookooFrame }>;
  samples: ScaleSample[];
  rejectedFrames: number;
} {
  const decoder = new BookooDecoder();
  const frames: Array<{ atMs: number; frame: BookooFrame }> = [];
  const samples: ScaleSample[] = [];
  let rejectedFrames = 0;
  for (const event of recording.events) {
    if (event.kind === "connected" || event.kind === "disconnected") {
      rejectedFrames += decoder.rejectedFrames;
      decoder.reset();
    }
    if (event.kind !== "notification") continue;
    for (const frame of decoder.push(Uint8Array.from(event.bytes))) {
      frames.push({ atMs: event.atMs, frame });
      const sample = recording.metadata.encoding
        ? toSample(frame, event.atMs, recording.metadata.encoding)
        : null;
      if (sample) samples.push(sample);
    }
  }
  return {
    frames,
    samples,
    rejectedFrames: rejectedFrames + decoder.rejectedFrames,
  };
}
