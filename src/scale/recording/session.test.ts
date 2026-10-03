import { expect, it } from "vitest";
import { syntheticFrame } from "@/scale/bookoo/synthetic.fixture";
import {
  createRecorder,
  maximumRecordingEvents,
  parseRecording,
} from "@/scale/recording/session";
import { syntheticMetadata } from "@/scale/recording/synthetic.fixture";
import { replayBookoo } from "@/scale/replay/bookoo";

it("roundtrips and replays original split/combined chunks without losing same-time samples", () => {
  let now = 1000;
  const recorder = createRecorder(syntheticMetadata, "synthetic", () => now);
  recorder.append({ kind: "connected" });
  now += 10;
  const positive = syntheticFrame();
  recorder.append({
    kind: "notification",
    bytes: Array.from(positive.subarray(0, 4)),
  });
  now += 10;
  recorder.append({
    kind: "notification",
    bytes: [...positive.subarray(4), ...syntheticFrame({ sign: 9 })],
  });
  const raw = parseRecording(JSON.stringify(recorder.snapshot()));
  expect(raw.events[1]?.atMs).toBe(10);
  expect(replayBookoo(raw).samples).toEqual([
    { atMs: 20, grams: 123.45 },
    { atMs: 20, grams: -123.45 },
  ]);
  recorder.append({ kind: "disconnected" });
  recorder.append({
    kind: "notification",
    bytes: Array.from(positive.subarray(4)),
  });
  expect(replayBookoo(recorder.snapshot()).frames).toHaveLength(2);
});
it("rejects unknown fields, IDs, regressed time, nonbytes and unrecognized schema", () => {
  const recorder = createRecorder(syntheticMetadata, "synthetic", () => 0);
  recorder.append({ kind: "connected" });
  const raw = recorder.snapshot();
  for (const invalid of [
    { ...raw, schemaVersion: 2 },
    { ...raw, source: ["hardware"] },
    { ...raw, deviceId: "secret" },
    { ...raw, metadata: { ...raw.metadata, deviceId: "secret" } },
    { ...raw, events: [{ kind: "notification", atMs: 0, bytes: [256] }] },
    {
      ...raw,
      events: [
        { kind: "connected", atMs: 2 },
        { kind: "disconnected", atMs: 1 },
      ],
    },
  ])
    expect(() => parseRecording(JSON.stringify(invalid))).toThrow();
  expect(() =>
    recorder.append({ kind: "notification", bytes: [256] }),
  ).toThrow();
  expect(() =>
    recorder.append({ kind: "annotation", text: "x".repeat(2001) }),
  ).toThrow();
});
it("bounds capture and returns independent snapshots and cheap stats", () => {
  const recorder = createRecorder(syntheticMetadata, "synthetic", () => 0);
  for (let i = 0; i <= maximumRecordingEvents; i++)
    recorder.append({ kind: "connected" });
  expect(recorder.stats()).toEqual({
    eventCount: maximumRecordingEvents,
    truncated: true,
  });
  const clone = recorder.snapshot();
  clone.events.length = 0;
  expect(recorder.stats().eventCount).toBe(maximumRecordingEvents);
});
