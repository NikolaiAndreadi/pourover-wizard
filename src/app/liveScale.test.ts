import { describe, expect, it, vi } from "vitest";
import { syntheticFrame } from "@/scale/bookoo/synthetic.fixture";
import type {
  ScanCandidate,
  ScanObservers,
  ScanSupport,
  TransportObservers,
} from "@/scale/contracts";
import { supportedScales } from "@/scale/supported";
import { createLiveScale } from "./liveScale";

function setup(scan?: ScanSupport) {
  let observers: TransportObservers | null = null;
  const transport = {
    ...(scan ? { scan } : {}),
    connect: vi.fn(async (value: TransportObservers) => {
      observers = value;
    }),
    connectAll: vi.fn(async (value: TransportObservers) => {
      observers = value;
    }),
    write: vi.fn(async (_bytes: Uint8Array) => {}),
    disconnect: vi.fn(),
  };
  const sample = vi.fn(),
    lost = vi.fn(),
    tared = vi.fn(),
    changed = vi.fn(),
    disconnected = vi.fn();
  const live = createLiveScale(
    transport,
    { gramsUnit: 2, positiveSign: 7, negativeSign: 9 },
    () => 100,
    sample,
    lost,
    tared,
    changed,
    disconnected,
  );
  return {
    live,
    transport,
    sample,
    lost,
    tared,
    changed,
    disconnected,
    observers: () => observers!,
  };
}
describe("live brewing adapter", () => {
  it("notifies physical and explicit disconnects once, without treating setup, tare or disposal as disconnects", async () => {
    const s = setup();
    s.live.disconnect();
    await s.live.connect();
    await s.live.tare();
    expect(s.disconnected).not.toHaveBeenCalled();
    s.observers().onDisconnect();
    s.observers().onDisconnect();
    expect(s.disconnected).toHaveBeenCalledTimes(1);
    await s.live.connect();
    s.live.disconnect();
    s.live.disconnect();
    expect(s.disconnected).toHaveBeenCalledTimes(2);
    await s.live.connect();
    s.live.dispose();
    expect(s.disconnected).toHaveBeenCalledTimes(2);
    s.transport.connect.mockRejectedValueOnce(new Error("Connection failed"));
    await s.live.connect();
    expect(s.disconnected).toHaveBeenCalledTimes(2);
  });
  it("accepts only confirmed frames, ignores old subscriptions and resets partial decoding on reconnect", async () => {
    const s = setup();
    await s.live.connect();
    const old = s.observers();
    old.onChunk(syntheticFrame({ magnitude: 1234 }));
    expect(s.sample).toHaveBeenLastCalledWith({ atMs: 100, grams: 12.34 });
    old.onChunk(syntheticFrame({ unit: 3 }));
    expect(s.sample).toHaveBeenCalledTimes(1);
    old.onChunk(syntheticFrame().slice(0, 10));
    s.live.disconnect();
    await s.live.connect();
    old.onChunk(syntheticFrame());
    old.onDisconnect();
    s.observers().onChunk(syntheticFrame().slice(10));
    expect(s.sample).toHaveBeenCalledTimes(1);
    s.observers().onChunk(syntheticFrame({ sign: 9, magnitude: 100 }));
    expect(s.sample).toHaveBeenLastCalledWith({ atMs: 100, grams: -1 });
  });
  it("tare requires successful write, exposes failures, and ignores completion after disconnect", async () => {
    const s = setup();
    await s.live.connect();
    s.transport.write.mockRejectedValueOnce(new Error("write failed"));
    await s.live.tare();
    expect(s.tared).not.toHaveBeenCalled();
    expect(s.changed).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: "write failed", pendingTare: false }),
    );
    let resolve!: () => void;
    s.transport.write.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const pending = s.live.tare();
    s.live.disconnect();
    resolve();
    await pending;
    expect(s.tared).not.toHaveBeenCalled();
    await s.live.connect();
    await s.live.tare();
    expect(s.tared).toHaveBeenCalledTimes(1);
    expect(Array.from(s.transport.write.mock.calls.at(-1)?.[0] ?? [])).toEqual([
      3, 10, 1, 0, 0, 8,
    ]);
  });
  it("late connect resolution and failure cannot publish after dispose", async () => {
    const s = setup();
    let reject!: (reason: Error) => void;
    s.transport.connect.mockImplementationOnce(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const pending = s.live.connect();
    s.live.dispose();
    const calls = s.changed.mock.calls.length;
    reject(new Error("late"));
    await pending;
    expect(s.changed).toHaveBeenCalledTimes(calls);
  });
  it("publishes chooser and known-scale progress while connecting, then clears it", async () => {
    const s = setup();
    let finish = () => {};
    s.transport.connect.mockImplementationOnce(
      (value: TransportObservers) =>
        new Promise<void>((resolve) => {
          value.onProgress?.({ kind: "chooser" });
          value.onProgress?.({ kind: "device", name: "BOOKOO_SC 000000" });
          finish = resolve;
        }),
    );
    const pending = s.live.connect();
    expect(s.changed).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "connecting",
        progress: { kind: "device", name: "BOOKOO_SC 000000" },
      }),
    );
    finish();
    await pending;
    expect(s.changed).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "connected", progress: null }),
    );
  });
});
describe("show all devices", () => {
  const mini = supportedScales[0]!;
  it("offers all devices after a failed filtered attempt, then connects through the unfiltered chooser and names the model", async () => {
    const s = setup();
    s.transport.connect.mockRejectedValueOnce(
      Object.assign(new Error("User cancelled"), { name: "NotFoundError" }),
    );
    await s.live.connect();
    expect(s.changed).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "disconnected",
        offerAllDevices: true,
        error: "User cancelled",
      }),
    );
    s.transport.connectAll.mockImplementationOnce(
      async (value: TransportObservers) => {
        value.onIdentified?.(mini);
      },
    );
    await s.live.connectAll();
    expect(s.transport.connectAll).toHaveBeenCalledOnce();
    expect(s.changed).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "connected",
        model: mini,
        offerAllDevices: false,
        scanning: false,
      }),
    );
    s.live.disconnect();
    expect(s.changed).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "disconnected", model: null }),
    );
  });
  it("refuses a model with another protocol instead of decoding it", async () => {
    const s = setup();
    s.transport.connect.mockImplementationOnce(
      async (value: TransportObservers) => {
        value.onIdentified?.({
          ...mini,
          id: "other",
          model: "Other",
          protocol: "other-protocol" as typeof mini.protocol,
        });
      },
    );
    await s.live.connect();
    expect(s.transport.disconnect).toHaveBeenCalled();
    expect(s.changed).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "disconnected",
        model: null,
        offerAllDevices: true,
        error: 'Unsupported scale protocol "other-protocol" on BOOKOO Other.',
      }),
    );
  });
  it("scans in-app where supported, lists sorted candidates, and connects the pick", async () => {
    let scan: ScanObservers | null = null;
    let finish = () => {};
    const start = vi.fn(
      (value: ScanObservers) =>
        new Promise<void>((resolve) => {
          scan = value;
          finish = resolve;
        }),
    );
    const connect = vi.fn(
      async (_candidate: ScanCandidate, value: TransportObservers) => {
        value.onIdentified?.(mini);
      },
    );
    const s = setup({ start, connect });
    const pending = s.live.connectAll();
    expect(s.changed).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "disconnected",
        scanning: true,
        candidates: [],
      }),
    );
    const list = [
      { id: "near", name: "BOOKOO_SC 1", rssi: -60 },
      { id: "far" },
    ];
    scan!.onCandidates(list);
    expect(s.changed).toHaveBeenLastCalledWith(
      expect.objectContaining({ scanning: true, candidates: list }),
    );
    finish();
    await pending;
    expect(s.changed).toHaveBeenLastCalledWith(
      expect.objectContaining({ scanning: false, candidates: list }),
    );
    expect(s.transport.connectAll).not.toHaveBeenCalled();
    await s.live.pickCandidate("missing");
    expect(connect).not.toHaveBeenCalled();
    await s.live.pickCandidate("near");
    expect(connect).toHaveBeenCalledWith(list[0], expect.any(Object));
    expect(s.changed).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "connected",
        model: mini,
        candidates: [],
      }),
    );
  });
  it("stops a scan early, keeping found devices, and ignores the cancelled scan's outcome", async () => {
    let scan: ScanObservers | null = null;
    let reject = (_reason: Error) => {};
    const s = setup({
      start: vi.fn(
        (value: ScanObservers) =>
          new Promise<void>((_, fail) => {
            scan = value;
            reject = fail;
          }),
      ),
      connect: vi.fn(async () => {}),
    });
    const pending = s.live.connectAll();
    scan!.onCandidates([{ id: "a" }]);
    s.live.stopScan();
    expect(s.transport.disconnect).toHaveBeenCalled();
    expect(s.changed).toHaveBeenLastCalledWith(
      expect.objectContaining({ scanning: false, candidates: [{ id: "a" }] }),
    );
    const calls = s.changed.mock.calls.length;
    reject(new Error("Connection cancelled."));
    await pending;
    expect(s.changed).toHaveBeenCalledTimes(calls);
    s.live.stopScan();
    expect(s.changed).toHaveBeenCalledTimes(calls);
  });
  it("reports a scan that fails to start", async () => {
    const s = setup({
      start: vi.fn(async () => {
        throw new Error("Bluetooth is off");
      }),
      connect: vi.fn(async () => {}),
    });
    await s.live.connectAll();
    expect(s.changed).toHaveBeenLastCalledWith(
      expect.objectContaining({ scanning: false, error: "Bluetooth is off" }),
    );
  });
});
