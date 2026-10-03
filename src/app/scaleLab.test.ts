import { expect, it } from "vitest";
import { createScaleLab, type LabSnapshot } from "@/app/scaleLab";
import { syntheticFrame } from "@/scale/bookoo/synthetic.fixture";
import type { TransportObservers } from "@/scale/contracts";
import { syntheticMetadata } from "@/scale/recording/synthetic.fixture";
import { replayBookoo } from "@/scale/replay/bookoo";

it("orders a connection boundary before early split notifications; errors preserve capture", async () => {
  let observer: TransportObservers | undefined;
  const states: LabSnapshot[] = [];
  const controller = createScaleLab(
    {
      async connect(value) {
        observer = value;
        value.onChunk(syntheticFrame().subarray(0, 4));
      },
      async write() {
        throw new Error("write failed");
      },
      disconnect() {},
    },
    syntheticMetadata,
    () => 10,
    (state) => states.push(state),
  );
  await controller.connect();
  observer!.onChunk(syntheticFrame().subarray(4));
  await controller.command("tare");
  expect(replayBookoo(controller.recording()).frames).toHaveLength(1);
  expect(states.at(-1)?.error).toBe("write failed");
  expect(controller.recording().events.map((event) => event.kind)).toEqual([
    "connected",
    "notification",
    "notification",
    "command",
    "error",
  ]);
  observer!.onDisconnect();
  expect(states.at(-1)?.frame).toBeNull();
  const count = controller.recording().events.length;
  observer!.onChunk(syntheticFrame());
  expect(controller.recording().events).toHaveLength(count);
});
it("cancels pending connection and disposes without stale publish", async () => {
  let finish: () => void = () => {};
  const states: LabSnapshot[] = [];
  let disconnects = 0;
  const controller = createScaleLab(
    {
      connect() {
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
      async write() {},
      disconnect() {
        disconnects++;
      },
    },
    syntheticMetadata,
    () => 0,
    (state) => states.push(state),
  );
  const pending = controller.connect();
  controller.disconnect();
  finish();
  await pending;
  expect(states.at(-1)?.state).toBe("disconnected");
  controller.dispose();
  expect(disconnects).toBe(2);
});

it("persists bounded transport diagnostics and completes the error transition", async () => {
  const states: LabSnapshot[] = [];
  const controller = createScaleLab(
    {
      async connect() {
        throw new Error("x".repeat(3000));
      },
      async write() {},
      disconnect() {},
    },
    syntheticMetadata,
    () => 0,
    (state) => states.push(state),
  );
  await expect(controller.connect()).resolves.toBeUndefined();
  expect(states.at(-1)?.state).toBe("disconnected");
  expect(states.at(-1)?.error).toHaveLength(2000);
  expect(controller.recording().events.at(-1)).toEqual({
    kind: "error",
    atMs: 0,
    text: "x".repeat(2000),
  });
});
