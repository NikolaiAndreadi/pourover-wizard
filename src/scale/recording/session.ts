import type { ConfirmedEncoding } from "@/scale/bookoo/codec";

export interface RecordingMetadata {
  model: "BOOKOO Themis Mini";
  firmware: string;
  browser: string;
  os: string;
  service: string;
  notifyCharacteristic: string;
  commandCharacteristic: string;
  encoding: ConfirmedEncoding | null;
}
export type RecordingEvent =
  | { atMs: number; kind: "notification" | "command"; bytes: number[] }
  | { atMs: number; kind: "connected" | "disconnected" }
  | { atMs: number; kind: "annotation" | "error"; text: string };
export interface RawRecording {
  schemaVersion: 1;
  source: "hardware" | "synthetic";
  metadata: RecordingMetadata;
  events: RecordingEvent[];
  truncated: boolean;
}
export const maximumRecordingEvents = 20_000;
export function createRecorder(
  metadata: RecordingMetadata,
  source: RawRecording["source"],
  nowMs: () => number,
) {
  const origin = nowMs();
  const recording: RawRecording = {
    schemaVersion: 1,
    source,
    metadata: structuredClone(metadata),
    events: [],
    truncated: false,
  };
  parseRecording(JSON.stringify(recording));
  if (!Number.isFinite(origin)) throw new Error("Invalid recording clock.");
  let lastAt = 0;
  return {
    append(
      event:
        | Omit<Extract<RecordingEvent, { bytes: number[] }>, "atMs">
        | Omit<Extract<RecordingEvent, { text: string }>, "atMs">
        | { kind: "connected" | "disconnected" },
    ): void {
      if (recording.events.length >= maximumRecordingEvents) {
        recording.truncated = true;
        return;
      }
      if (
        "bytes" in event &&
        (event.bytes.length > 512 ||
          !event.bytes.every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
      )
        throw new Error("Invalid raw bytes.");
      if ("text" in event && event.text.length > 2000)
        throw new Error("Annotation is too long.");
      const atMs = nowMs() - origin;
      if (!Number.isFinite(atMs) || atMs < lastAt || atMs < 0)
        throw new Error("Recording clock must be monotonic.");
      lastAt = atMs;
      recording.events.push({ ...structuredClone(event), atMs });
    },
    stats(): { eventCount: number; truncated: boolean } {
      return {
        eventCount: recording.events.length,
        truncated: recording.truncated,
      };
    },
    snapshot(): RawRecording {
      return structuredClone(recording);
    },
  };
}
// Reject unknown fields so imported device IDs cannot silently enter exports.
export function parseRecording(text: string): RawRecording {
  const value: unknown = JSON.parse(text);
  const object = (input: unknown): Record<string, unknown> => {
    if (input === null || typeof input !== "object" || Array.isArray(input))
      throw new Error("Expected recording object.");
    return input as Record<string, unknown>;
  };
  const keys = (input: Record<string, unknown>, allowed: string[]) => {
    if (
      Object.keys(input).some((key) => !allowed.includes(key)) ||
      allowed.some((key) => !(key in input))
    )
      throw new Error("Unexpected recording fields.");
  };
  const raw = object(value);
  keys(raw, ["schemaVersion", "source", "metadata", "events", "truncated"]);
  if (
    raw.schemaVersion !== 1 ||
    (raw.source !== "hardware" && raw.source !== "synthetic") ||
    typeof raw.truncated !== "boolean"
  )
    throw new Error("Unsupported recording schema.");
  const meta = object(raw.metadata);
  keys(meta, [
    "model",
    "firmware",
    "browser",
    "os",
    "service",
    "notifyCharacteristic",
    "commandCharacteristic",
    "encoding",
  ]);
  if (
    meta.model !== "BOOKOO Themis Mini" ||
    Object.entries(meta).some(
      ([key, item]) =>
        key !== "encoding" && (typeof item !== "string" || item.length > 500),
    )
  )
    throw new Error("Invalid metadata.");
  if (meta.encoding !== null) {
    const encoding = object(meta.encoding);
    keys(encoding, ["gramsUnit", "positiveSign", "negativeSign"]);
    if (
      !Object.values(encoding).every(
        (n) =>
          typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 255,
      ) ||
      encoding.positiveSign === encoding.negativeSign
    )
      throw new Error("Invalid encoding.");
  }
  if (!Array.isArray(raw.events) || raw.events.length > maximumRecordingEvents)
    throw new Error("Invalid event count.");
  let lastAt = 0;
  for (const input of raw.events) {
    const event = object(input);
    if (
      typeof event.atMs !== "number" ||
      !Number.isFinite(event.atMs) ||
      event.atMs < lastAt
    )
      throw new Error("Nonmonotonic event time.");
    lastAt = event.atMs;
    if (event.kind === "notification" || event.kind === "command") {
      keys(event, ["atMs", "kind", "bytes"]);
      if (
        !Array.isArray(event.bytes) ||
        event.bytes.length > 512 ||
        !event.bytes.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
      )
        throw new Error("Invalid raw bytes.");
    } else if (event.kind === "annotation" || event.kind === "error") {
      keys(event, ["atMs", "kind", "text"]);
      if (typeof event.text !== "string" || event.text.length > 2000)
        throw new Error("Invalid annotation.");
    } else if (event.kind === "connected" || event.kind === "disconnected")
      keys(event, ["atMs", "kind"]);
    else throw new Error("Unknown recording event.");
  }
  return value as RawRecording;
}
